import express from 'express'
import crypto from 'crypto'
import fs from 'fs'

import commonUtils from '../common/utils.js'
import providerUtils from './utils.js'
import utils from './utils.js'


const app = express()
const port = 8000

const ongoingTransactions = {}
const ongoingChallenges = {}
const ongoingModifications = []
const tokens = {}
const tokenNotifyUrls = {}
let instantlyAcceptModify = true

const privkey = fs.readFileSync('../keys/bank_privkey.pem')
const pubkey = fs.readFileSync('../keys/bank_pubkey.pem')


app.set('views', 'views')
app.set('view engine', 'ejs')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/', express.static('public'))


app.post('/start', async (req, res) => {
    if (!req.body.url) {
        return res.sendStatus(400)
    }
    
    const providerHello = providerUtils.generateProviderHelloMsg(req.body.url, privkey)
    const [ vendor_res, error_code, error_msg ] = await providerUtils.getVendorTokenMsg(req.body.url, providerHello)
    if (!vendor_res) {
        return res.render('error', {
            error_code: error_code,
            error_msg: error_msg
        })
    }
    
    ongoingTransactions[providerHello.transaction_id] = {
        token: vendor_res?.token,
        response_url: vendor_res?.response_url,
        pin: providerHello.verification_pin
    }
    return res.render('details', {
        vendor_name: vendor_res?.vendor?.name,
        vendor_address: vendor_res?.vendor?.address,
        amount: vendor_res?.transaction?.amount,
        currency: vendor_res?.transaction?.currency_code,
        recurrance: vendor_res?.transaction?.recurrance,
        t_id: providerHello.transaction_id
    })
})


app.post('/verify', async (req, res) => {
    if (!(req.body.t_id in ongoingTransactions)) {
        return res.sendStatus(400)
    }

    const transaction = ongoingTransactions[req.body.t_id]
    const vendorToken = utils.base64ToObject(transaction.token, 'base64')
    delete ongoingTransactions[req.body.t_id]

    let token = {}
    let providerTokenMsg = {}
    if (req.body.decision != 'accept') {
        providerTokenMsg = {
            allowed: false,
            error_code: 'USER_DECLINED',
            error_message: 'The user declined the transaction'
        }
    } else if (req.body.pin != transaction.pin) {
        providerTokenMsg = {
            allowed: false,
            error_code: 'INCORRECT_PIN',
            error_message: 'The user entered an incorrect pin'
        }
    } else if (!providerUtils.verifyVendorToken(vendorToken)) {
        providerTokenMsg = {
            allowed: false,
            error_code: 'INCORRECT_SIGNATURE',
            error_message: 'The vendor signature of the token is incorrect'
        }
    } else {
        token = providerUtils.signToken(vendorToken, privkey, pubkey)
        providerTokenMsg = {
            allowed: true,
            token: utils.base64ToObject(token),
            change_url: `stp://localhost:${port}/api/stp/change`
        }
    }

    const [ vendorAck, error_code, error_msg ] = await providerUtils.sendProviderTokenMsg(transaction.response_url, providerTokenMsg)
    if (error_code) {
        return res.render('error', {
            error_code: error_code,
            error_msg: error_msg
        })
    }

    tokens[token.transaction.id] = token
    tokenNotifyUrls[token.transaction.id] = vendorAck.notify_url
    return res.render('result', {
        token: JSON.stringify(token, null, 4)
    })
})


app.post('/set_accept_modify', async (req, res) => {
    instantlyAcceptModify = req.body.value
    console.log('instantlyAcceptModify set to', instantlyAcceptModify)
    return res.send('')
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


app.post('/api/stp/change_next/:id', async (req, res) => {
    const id = req.params.id
    if (!(id in ongoingChallenges)) {
        return res.sendStatus(400)
    }
    commonUtils.logMsg('VendorVerifChange', req.body)
    const challenge = ongoingChallenges[id]
    delete ongoingChallenges[id]

    if (!req.body.success) {
        return res.send(req.body)
    }
    if (!commonUtils.verifyChallResponse(challenge, req.body.response, tokens[id].signatures.vendor_key)) {
        return res.send({
            success: false,
            error_code: 'AUTH_FAILED',
            error_message: 'The vendor\'s response to the challenge was not appropriate'
        })
    }
    if (req.body.change_verb == 'REVOKE') {
        delete tokens[id]
        delete tokenNotifyUrls[id]
        return res.send({ success: true })
    } else if (req.body.change_verb == 'REFRESH') {
        const token = utils.base64ToObject(req.body.token, 'base64')
        if (!providerUtils.isRefreshedTokenValid(tokens[id], token)) {
            return res.send({
                success: false,
                error_code: 'INCORRECT_TOKEN',
                error_message: 'The refreshed token contains incorrect data'
            })
        }
        if (!providerUtils.verifyVendorToken(token)) {
            return res.send({
                success: false,
                error_code: 'INCORRECT_TOKEN_SIGN',
                error_message: 'The refreshed token is not signed properly'
            })
        }
        const fullToken = providerUtils.signToken(token, privkey, pubkey)
        tokens[id] = fullToken
        return res.send({
            success: true,
            token: utils.objectToBase64(fullToken)
        })
    } else if (req.body.change_verb == 'MODIFY') {
        const token = utils.base64ToObject(req.body.token, 'base64')
        if (!providerUtils.verifyVendorToken(token)) {
            return res.send({
                success: false,
                error_code: 'INCORRECT_TOKEN_SIGN',
                error_message: 'The modified token is not signed properly'
            })
        }
        if (instantlyAcceptModify) {
            const fullToken = providerUtils.signToken(token, privkey, pubkey)
            tokens[id] = fullToken
            return res.send({
                success: true,
                modification_status: 'ACCEPTED',
                token: utils.objectToBase64(fullToken)
            })
        } else {
            ongoingModifications.push({
                id: id,
                modification: req.body.modification,
                token: token,
            })
            return res.send({
                success: true,
                modification_status: 'PENDING'
            })
        }
    } else {
        return res.send({
            success: false,
            error_code: 'UNKNOWN_CHANGE_VERB',
            error_message: 'Unsupported change_verb'
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

    const [ err_code, err_msg ] = await providerUtils.notify(id, 'REVOKE', privkey, pubkey, tokens, tokenNotifyUrls)
    if (err_code) {
        return res.render('error', {
            error_code: err_code,
            error_msg: err_msg
        })
    }
    return res.redirect('/')
})


app.get('/ongoing_modification', async (req, res) => {
    console.log(ongoingModifications.length)
    if (ongoingModifications.length != 0) {
        return res.send(ongoingModifications[ongoingModifications.length - 1])
    }
    return res.send({ not_found: true })
})


app.post('/handle_modification/:id', async (req, res) => {
    const id = req.params.id
    const accept = req.body.accept
    const modifIndex = ongoingModifications.findIndex((elem) => elem.id == id )
    const modification = ongoingModifications[modifIndex]
    ongoingModifications.splice(modifIndex, 1)

    const [ err_code, err_msg ] = await providerUtils.notify(id, 'FINISH_MODIFICATION', privkey, pubkey, tokens, tokenNotifyUrls, { accept: accept, token: modification.token })
    if (err_code) {
        return res.render('error', {
            error_code: err_code,
            error_msg: err_msg
        })
    }

    tokens[id] = providerUtils.signToken(modification.token, privkey, pubkey)
    
    return res.redirect('/')
})


app.listen(port, () => {
    console.log(`Provider app listening on port http://localhost:${port}`)
})
