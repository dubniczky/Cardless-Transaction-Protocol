import express from 'express'
import crypto from 'crypto'
import fs from 'fs'

import commonUtils from '../common/utils.js'
import vendorUtils from './utils.js'


const app = express()
const port = 3000


app.set('views', 'views')
app.set('view engine', 'ejs')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/', express.static('public'))


app.post('/gen_url', async (req, res) => {
    if (!vendorUtils.doesBodyContainFields(req, res, ['amount', 'currency', 'recurring'])) {
        return
    }
    
    const uuid = vendorUtils.generateNewTransactionUrl(req)
    res.render('show_url', {
        url: `stp://localhost:${port}/api/stp/request/${uuid}`,
    })
})


app.post('/api/stp/request/:uuid', async (req, res) => {
    const uuid = req.params.uuid
    commonUtils.logMsg('ProviderHello', req.body, uuid)
    if (!vendorUtils.isOngoingRequest(res, uuid) ||
        !vendorUtils.doesBodyContainFields(req, res, ['verification_pin', 'url_signature']) ||
        !vendorUtils.verifyUrlSignature(res, uuid, req.body.url_signature)) {
        return
    }

    vendorUtils.sendVendorTokenMsg(req, res, uuid, port)
})


app.get('/api/stp/request/:uuid/pin', async (req, res) => {
    const uuid = req.params.uuid
    await vendorUtils.waitAndSendRequestPin(res, uuid)
})


app.post('/api/stp/response/:uuid', async (req, res) => {
    const uuid = req.params.uuid
    commonUtils.logMsg('ProviderToken', req.body, uuid)
    if (!vendorUtils.isOngoingResponse(res, uuid) ||
        !vendorUtils.checkProviderTokenMsg(req, res)) {
        return
    }

    vendorUtils.sendVendorAck(req, res, port)
})


app.post('/api/stp/notify', async (req, res) => {
    commonUtils.logMsg('ProviderChall', req.body)
    if (!vendorUtils.doesTokenExist(res, req.body.transaction_id)) {
        return
    }

    vendorUtils.sendVendorVerifChall(req, res)
})


app.post('/api/stp/notify_next/:id', async (req, res) => {
    const id = req.params.id
    commonUtils.logMsg('ProviderVerifNotify', req.body)
    if (!vendorUtils.isOngoingChallenge(res, id)) {
        return
    }

    const challenge = vendorUtils.popChallenge(id)
    if (!vendorUtils.checkProviderVerifNotify(req, res, is, challenge)) {
        return
    }

    switch (req.body.notify_verb) {
        case 'REVOKE':
            vendorUtils.handleRevokeNotification(res, id)
            break
        case 'FINISH_MODIFICATION':
            vendorUtils.handleFinishModifyNotification(req, res, id)
            break
        default:
            vendorUtils.handleUnknownNotification(res)
    }
})


app.get('/tokens', async (req, res) => {
    res.send(vendorUtils.getAllTokensList())
})


app.get('/token/:id', async (req, res) => {
    const id = req.params.id
    res.render('token', {
        id: id,
        token: vendorUtils.formatJSON(vendorUtils.getToken(id))
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
