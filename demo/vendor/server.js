import express from 'express'
import crypto from 'crypto'
import fs from 'fs'

import commonUtils from '../common/utils.js'
import vendorUtils from './utils.js'


const app = express()
const port = 3000

// TODO move to utils?
const ongoingRequests = {}
const ongoingResponses = {}
const ongoingRequestPins = {}
const ongoingChallenges = {}
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
    const uuid = vendorUtils.generateNewTransactionUrl(req)
    if (!uuid) {
        return res.sendStatus(400)
    }
    
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


app.post('/api/stp/change', async (req, res) => {
    commonUtils.logMsg('VendorChall', req.body)
    if (!(req.body.transaction_id in tokens)) {
        return res.send({
            success: false,
            error_code: 'ID_NOT_FOUND',
            error_message: 'The given transaction_id has no associated tokens',
        })
    }

    const challenge = commonUtils.genChallenge(30)
    ongoingChallenges[req.body.transaction_id] = challenge
    return res.send({
        success: true,
        response: commonUtils.signChall(req.body.challenge, privkey),
        challenge: challenge,
        next_url: `stp://localhost:${port}/api/stp/change_next/${req.body.transaction_id}`
    })
})


app.post('/api/stp/notify', async (req, res) => {
    commonUtils.logMsg('ProviderChall', req.body)
    if (!(req.body.transaction_id in tokens)) {
        return res.send({
            success: false,
            error_code: 'ID_NOT_FOUND',
            error_message: 'The given transaction_id has no associated tokens',
        })
    }

    const challenge = commonUtils.genChallenge(30)
    ongoingChallenges[req.body.transaction_id] = challenge
    return res.send({
        success: true,
        response: commonUtils.signChall(req.body.challenge, privkey),
        challenge: challenge,
        next_url: `stp://localhost:${port}/api/stp/notify_next/${req.body.transaction_id}`
    })
})


app.post('/api/stp/notify_next/:id', async (req, res) => {
    const id = req.params.id
    if (!(id in ongoingChallenges)) {
        return res.sendStatus(400)
    }
    commonUtils.logMsg('ProviderVerifNotify', req.body)
    const challenge = ongoingChallenges[id]
    delete ongoingChallenges[id]

    if (!req.body.success) {
        return res.send(req.body)
    }
    if (!commonUtils.verifyChallResponse(challenge, req.body.response, tokens[id].signatures.provider_key)) {
        return res.send({
            success: false,
            error_code: 'AUTH_FAILED',
            error_message: 'The provider\'s response to the challenge was not appropriate'
        })
    }
    if (req.body.notify_verb == 'REVOKE') {
        delete tokens[id]
        delete tokenChangeUrls[id]
        return res.send({ success: true })
    } else if (req.body.notify_verb == 'FINISH_MODIFICATION') {
        if (req.body.modification_status == 'ACCEPTED') {
            tokens[id] = JSON.parse(Buffer.from(req.body.token, 'base64'))
        }
        return res.send({ success: true })
    } else {
        return res.send({
            success: false,
            error_code: 'UNKNOWN_NOTIFY_VERB',
            error_message: 'Unsupported notify_verb'
        })
    }
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


app.get('/modify/:id', async (req, res) => {
    const id = req.params.id
    if (!(id in tokens)) {
        return res.sendStatus(400)
    }
    const recurringData =  tokens[id].transaction.recurring
    return res.render('modify', {
        id: id,
        amount: tokens[id].transaction.amount,
        currency: tokens[id].transaction.currency,
        recurring: recurringData ? recurringData.period : 'one_time'
    })
})


app.post('/modify/:id', async (req, res) => {
    const id = req.params.id
    const modificationData = {
        amount: req.body.amount,
        currency: req.body.currency,
        period: req.body.recurring == 'one_time' ? null : req.params.recurring
    }
    console.log(modificationData)
    console.log(req.params)

    if (!(id in tokens)) {
        return res.sendStatus(400)
    }

    const [ err_code, err_msg ] = await vendorUtils.changeRequest(id, 'MODIFY', privkey, pubkey, tokens, tokenChangeUrls, modificationData)
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
