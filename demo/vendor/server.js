import express from 'express'

import utils from '../common/utils.js'
import validator from './validator.js'
import protocol from './protocol.js'
import { getAllTokensList, getToken, popOngoingChallenge }  from './protocolState.js'


const app = express()
const port = 3000


app.set('views', 'views')
app.set('view engine', 'ejs')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/', express.static('public'))


app.post('/gen_url', async (req, res) => {
    if (!utils.doesBodyContainFields(req, res, ['amount', 'currency', 'recurring'])) {
        return
    }
    
    const uuid = protocol.generateNewTransactionUrl(req)
    res.render('show_url', {
        url: `stp://localhost:${port}/api/stp/request/${uuid}`,
    })
})


app.post('/api/stp/request/:uuid', async (req, res) => {
    const uuid = req.params.uuid
    utils.logMsg('ProviderHello', req.body, uuid)
    if (!validator.isOngoingRequest(res, uuid) ||
        !utils.doesBodyContainFields(req, res, ['verification_pin', 'url_signature']) ||
        !validator.verifyUrlSignature(res, uuid, req.body.url_signature)) {
        return
    }

    protocol.sendVendorTokenMsg(req, res, uuid, port)
})


app.get('/api/stp/request/:uuid/pin', async (req, res) => {
    const uuid = req.params.uuid
    await protocol.waitAndSendRequestPin(res, uuid)
})


app.post('/api/stp/response/:uuid', async (req, res) => {
    const uuid = req.params.uuid
    utils.logMsg('ProviderToken', req.body, uuid)
    if (!validator.isOngoingResponse(res, uuid) ||
        !validator.checkProviderTokenMsg(req, res)) {
        return
    }

    protocol.sendVendorAck(req, res, uuid, port)
})


app.post('/api/stp/notify', async (req, res) => {
    utils.logMsg('ProviderChall', req.body)
    if (!validator.doesTokenExist(res, req.body.transaction_id)) {
        return
    }

    protocol.sendVendorVerifChall(req, res, port)
})


app.post('/api/stp/notify_next/:id', async (req, res) => {
    const id = req.params.id
    utils.logMsg('ProviderVerifNotify', req.body)
    if (!validator.isOngoingChallenge(res, id)) {
        return
    }

    const challenge = popOngoingChallenge(id)
    if (!validator.checkProviderVerifNotify(req, res, id, challenge)) {
        return
    }

    switch (req.body.notify_verb) {
        case 'REVOKE':
            protocol.handleRevokeNotification(res, id)
            break
        case 'FINISH_MODIFICATION':
            protocol.handleFinishModifyNotification(req, res, id)
            break
        default:
            protocol.handleUnknownNotification(res)
    }
})


app.get('/tokens', async (req, res) => {
    res.send(getAllTokensList())
})


app.get('/token/:id', async (req, res) => {
    const id = req.params.id
    res.render('token', {
        id: id,
        token: utils.formatJSON(getToken(id))
    })
})


app.get('/revoke/:id', async (req, res) => {
    const id = req.params.id
    if (!validator.doesTokenExist(res, id)) {
        return
    }

    const [ err_code, err_msg ] = await protocol.changeRequest(id, 'REVOKE')
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
    if (!validator.doesTokenExist(res, id) ||
        !validator.isTokenRecurring(res, id)) {
        return
    }
    
    const [ err_code, err_msg ] = await protocol.changeRequest(id, 'REFRESH')
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
    if (!validator.doesTokenExist(res, id)) {
        return
    }
    const token = getToken(id)
    return res.render('modify', {
        id: id,
        amount: token.transaction.amount,
        currency: token.transaction.currency,
        recurring: protocol.recurringPeriodToOption(token.transaction.recurring)
    })
})


app.post('/modify/:id', async (req, res) => {
    const id = req.params.id
    if (!validator.doesTokenExist(res, id)) {
        return
    }
    
    const modificationData = {
        amount: req.body.amount,
        currency: req.body.currency,
        period: protocol.recurringOptionToPeriod(req.body.recurring)
    }
    const [ err_code, err_msg ] = await protocol.changeRequest(id, 'MODIFY', modificationData)
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
