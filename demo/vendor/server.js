import express from 'express'
import crypto from 'crypto'
import fs from 'fs'

import commonUtils from '../common/utils.js'
import vendorUtils from './utils.js'


const app = express()
const port = 3000

const ongoingRequests = {}
const ongoingResponses = {}
const ongoingRequestPins = {}
const tokens = {}
const tokenChangeUrls = {}

const privkey = fs.readFileSync('../keys/vendor_privkey.pem')
const pubkey = fs.readFileSync('../keys/vendor_pubkey.pem')
const bankPubkey = fs.readFileSync('../keys/bank_pubkey.pem')


app.set('views', 'views')
app.set('view engine', 'ejs')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/', express.static('public'))


app.post('/gen_url', async (req, res) => {
    if (!req.body.amount || !req.body.currency || !req.body.recurring) {
        return res.sendStatus(400)
    }
    
    const uuid = crypto.randomUUID()
    ongoingRequests[uuid] = {
        amount: req.body.amount,
        currency: req.body.currency,
        period: req.body.recurring == 'one_time' ? null : req.body.recurring
    }
    console.log(`Transaction data:\n${uuid}: ${JSON.stringify(ongoingRequests[uuid])}\n`)
    return res.render('show_url', {
        url: `stp://localhost:${port}/api/stp/request/${uuid}`,
    })
})


app.post('/api/stp/request/:uuid', async (req, res) => {
    const uuid = req.params.uuid
    commonUtils.logMsg('ProviderHello', req.body, uuid)
    if (!(uuid in ongoingRequests)) {
        return res.sendStatus(400)
    }

    if (!('verification_pin' in req.body && 'url_signature' in req.body)) {
        return res.sendStatus(400)
    }
    if (!crypto.verify(null, Buffer.from(uuid), bankPubkey, new Buffer(req.body.url_signature, 'base64'))) {
        return res.send({
            success: false,
            error_code: 'INVALID_SIGNATURE',
            error_message: 'url_signature is not a valid signature of the provider'
        })
    }

    ongoingRequestPins[uuid] = req.body.verification_pin
    const currReq = ongoingRequests[uuid]
    delete ongoingRequests[uuid]
    const transId = crypto.randomUUID()
    ongoingResponses[transId] = currReq

    const token = vendorUtils.generateVendorToken(req.body, currReq, privkey, pubkey)
    const respMessage = vendorUtils.generateVendorTokenMsg(transId, port, token, currReq)
    return res.send(respMessage)
})


app.get('/api/stp/request/:uuid/pin', async (req, res) => {
    const uuid = req.params.uuid
    if (!(uuid in ongoingRequests || uuid in ongoingRequestPins)) {
        return res.sendStatus(400)
    }

    while (!(uuid in ongoingRequestPins)) {
        await new Promise(r => setTimeout(r, 100))
    }

    const pin = ongoingRequestPins[uuid]
    delete ongoingRequestPins[uuid]
    return res.send(pin.toString())
})


app.post('/api/stp/response/:uuid', async (req, res) => {
    const uuid = req.params.uuid
    commonUtils.logMsg('ProviderToken', req.body, uuid)
    if (!(uuid in ongoingResponses)) {
        return res.sendStatus(400)
    }

    const [ err_code, err_msg ] = vendorUtils.checkProviderTokenMsg(req.body)
    if (err_code) {
        return res.send({
            success: false,
            error_code: err_code,
            error_message: err_msg
        })
    }

    const token = JSON.parse(Buffer.from(req.body.token, 'base64'))
    tokens[token.transaction.id] = token
    tokenChangeUrls[token.transaction.id] = req.body.change_url
    console.log('Transaction token:', token)
    return res.send({
        success: true,
        notify_url: `stp://localhost:${port}/api/stp/notify`
    })
})


app.get('/tokens', async (req, res) => {
    return res.send(Object.values(tokens))
})


app.get('/token/:id', async (req, res) => {
    const id = req.params.id
    return res.render('token', {
        id: id,
        token: JSON.stringify(tokens[id], null, 4)
    })
})


app.get('/revoke/:id', async (req, res) => {
    const id = req.params.id
    if (!(id in tokens)) {
        return res.sendStatus(400)
    }

    const [ err_code, err_msg ] = await vendorUtils.changeRequest(id, 'REVOKE', privkey, pubkey, tokens, tokenChangeUrls)
    if (err_code) {
        return res.render('error', {
            error_code: err_code,
            error_msg: err_msg
        })
    }
    return res.redirect('/')
})


app.get('/refresh/:id', async (req, res) => {
    const id = req.params.id
    if (!(id in tokens)) {
        return res.sendStatus(400)
    }
    if (!tokens[id].transaction.recurring) {
        return res.render('error', {
            error_code: 'NON_RECURRING',
            error_msg: 'Cannot refresh non-recurring transaction token'
        })
    }
    
    const [ err_code, err_msg ] = await vendorUtils.changeRequest(id, 'REFRESH', privkey, pubkey, tokens, tokenChangeUrls)
    if (err_code) {
        return res.render('error', {
            error_code: err_code,
            error_msg: err_msg
        })
    }
    return res.redirect('/')
})


app.listen(port, () => {
    console.log(`Vendor app listening on port http://localhost:${port}`)
})
