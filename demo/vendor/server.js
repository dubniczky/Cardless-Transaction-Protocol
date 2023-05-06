import express from 'express'

import utils from '../common/utils.js'
import validator from './validator.js'
import protocol from './protocol.js'
import { getAllTokensList, getToken }  from './protocolState.js'


const app = express()
const port = 3000


app.set('views', 'views')
app.set('view engine', 'ejs')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/', express.static('public'))


app.post('/gen_url', async (req, res) => {
    if (!utils.doesBodyContainFields(req, res, ['amount', 'currency', 'recurring', 'suit'])) {
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
        !(await validator.verifyUrlSignature(res, uuid, req.body.url_signature))) {
        return
    }

    await protocol.sendVendorOfferMsg(req, res, uuid, port)
})


app.get('/api/stp/request/:uuid/pin', async (req, res) => {
    const uuid = req.params.uuid
    await protocol.waitAndSendRequestPin(res, uuid)
})


app.post('/api/stp/response/:uuid', async (req, res) => {
    const uuid = req.params.uuid
    utils.logMsg('ProviderConfirm', req.body, uuid)
    if (!validator.isOngoingResponse(res, uuid) ||
        !(await validator.checkProviderConfirmMsg(req, res))) {
        return
    }

    protocol.sendVendorAck(req, res, uuid, port)
})


app.post('/api/stp/revision/:uuid', async (req, res) => {
    const uuid = req.params.uuid
    utils.logMsg('ProviderRevise', req.body)
    if (!(await validator.checkProviderRevise(req, res, uuid))) {
        return
    }

    switch (req.body.revision_verb) {
        case 'REVOKE':
            await protocol.handleRevokeRevision(req, res)
            break
        case 'FINISH_MODIFICATION':
            await protocol.handleFinishModifyRevision(req, res)
            break
        default:
            protocol.handleUnknownRevision(res)
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

    const [ err_code, err_msg ] = await protocol.remediateToken(id, 'REVOKE')
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
    
    const [ err_code, err_msg ] = await protocol.remediateToken(id, 'REFRESH')
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
    
    const modifiedAmount = req.body.amount
    const [ err_code, err_msg ] = await protocol.remediateToken(id, 'MODIFY', modifiedAmount)
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
