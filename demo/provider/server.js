import express from 'express'

import utils from '../common/utils.js'
import protocol from './protocol.js'
import validator from './validator.js'
import { popOngoingTransaction, popOngoingModification, popOngoingChallenge, getAllTokensList, getToken } from './protocolState.js'


const app = express()
const port = 8000

let instantlyAcceptModify = true


app.set('views', 'views')
app.set('view engine', 'ejs')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/', express.static('public'))


app.post('/start', async (req, res) => {
    if (!utils.doesBodyContainFields(req, res, ['url'])) {
        return
    }
    
    const [ vendorToken, error_code, error_msg ] = await protocol.sendProviderHello(req.body.url)
    if (!vendorToken) {
        return res.render('error', {
            error_code: error_code,
            error_msg: error_msg
        })
    }
    
    return res.render('details', {
        vendor_name: vendorToken?.vendor?.name,
        vendor_address: vendorToken?.vendor?.address,
        amount: vendorToken?.transaction?.amount,
        currency: vendorToken?.transaction?.currency_code,
        recurrance: vendorToken?.transaction?.recurrance,
        t_id: utils.base64ToObject(vendorToken.token).transaction.id
    })
})


app.post('/verify', async (req, res) => {
    if (!validator.isOngoingTransaction(res, req.body.t_id)) {
        return
    }

    const transaction = popOngoingTransaction(req.body.t_id)
    const vendorToken = utils.base64ToObject(transaction.token)
    if (!validator.checkUserInput(req, res, transaction, vendorToken)) {
        return
    }

    const [ error_code, error_msg ] = await protocol.handleUserInput(transaction.response_url, vendorToken, port)
    if (error_code) {
        return res.render('error', {
            error_code: error_code,
            error_msg: error_msg
        })
    }

    return res.render('result', {
        token: utils.formatJSON(getToken(req.body.t_id))
    })
})


app.post('/set_accept_modify', async (req, res) => {
    instantlyAcceptModify = req.body.value
    console.log('instantlyAcceptModify set to', instantlyAcceptModify)
    return res.send('')
})


app.post('/api/stp/change', async (req, res) => {
    utils.logMsg('VendorChall', req.body)
    if (!utils.doesBodyContainFields(req, res, [ 'transaction_id', 'challenge' ]) ||
        !validator.doesTokenExist(res, req.body.transaction_id)) {
        return
    }

    const providerVerifChall = protocol.generateProviderVerifChall(req.body.transaction_id, req.body.challenge, port)
    res.send(providerVerifChall)
})


app.post('/api/stp/change_next/:id', async (req, res) => {
    const id = req.params.id
    utils.logMsg('VendorVerifChange', req.body)
    if (!validator.isOngoingChallenge(res, id)) {
        return
    }

    const challenge = popOngoingChallenge(id)
    if (!validator.checkVendorVerifChange(req, res, id, challenge)) {
        return
    }

    switch (req.body.change_verb) {
        case 'REVOKE':
            protocol.handleRevokeChange(res, id)
            break
        case 'REFRESH':
            protocol.handleRefreshChange(res, id, req.body.token)
            break
        case 'MODIFY':
            protocol.handleModificationChange(res, id, req.body.token, req.body.modification, instantlyAcceptModify)
            break
        default:
            protocol.handleUnknownChangeVerb(res)
    }
})


app.get('/tokens', async (req, res) => {
    return res.send(getAllTokensList())
})


app.get('/token/:id', async (req, res) => {
    const id = req.params.id
    return res.render('token', {
        id: id,
        token: utils.formatJSON(getToken(id))
    })
})


app.get('/revoke/:id', async (req, res) => {
    const id = req.params.id
    if (!validator.doesTokenExist(res, id)) {
        return
    }

    const [ err_code, err_msg ] = await protocol.notify(id, 'REVOKE')
    if (err_code) {
        return res.render('error', {
            error_code: err_code,
            error_msg: err_msg
        })
    }
    return res.redirect('/')
})


app.get('/ongoing_modification', async (req, res) => {
    const modification = popOngoingModification()
    if (modification) {
        return res.send(modification)
    }
    return res.send({ not_found: true })
})


app.post('/handle_modification/:id', async (req, res) => {
    const id = req.params.id
    if (!utils.doesBodyContainFields(req, res, [ 'accept' ]) ||
        !validator.doesTokenExist(res, id)) {
        return
    }
    const accept = req.body.accept
    const modification = popOngoingModification(id)

    const [ err_code, err_msg ] = await protocol.notify(id, 'FINISH_MODIFICATION', { accept: accept, token: modification.token })
    if (err_code) {
        return res.render('error', {
            error_code: err_code,
            error_msg: err_msg
        })
    }
    
    return res.redirect('/')
})


app.listen(port, () => {
    console.log(`Provider app listening on port http://localhost:${port}`)
})
