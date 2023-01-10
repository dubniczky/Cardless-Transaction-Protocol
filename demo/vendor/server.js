import express from 'express'
import crypto from 'crypto'
import fs from 'fs'

const app = express()
const port = 3000

const ongoingRequests = {}
const ongoingResponses = {}
const ongoingRequestPins = {}

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


function logMsg(msgName, uuid, content) {
    console.log(`${msgName} (provider -> vendor): ${uuid}`)
    console.log(content)
    console.log()
}


function getNextRecurrance(date, period) {
    switch (period) {
        case 'monthly':
            return new Date(date.setMonth(date.getMonth() + 1))
        case 'quarterly':
            return new Date(date.setMonth(date.getMonth() + 3))
        case 'annual':
            return new Date(date.setFullYear(date.getFullYear() + 1))
    }
}


function pemKeyToRawKeyStr(key) {
    const fullKeyStr = key.toString()
    const rawKeyStr = fullKeyStr.split('\n').slice(1, -2).join('')
    return rawKeyStr
}


function rawKeyStrToPemPubKey(key) {
    let pemKeyStr = '-----BEGIN PUBLIC KEY-----\n'
    for (let i = 0; i < key.length; i += 64) {
        pemKeyStr += key.substring(i, i + 64) + '\n'
    }
    pemKeyStr += '-----END PUBLIC KEY-----\n'
    return Buffer.from(pemKeyStr)
}


function generateVendorToken(reqBody, transactionData) {
    let token = {
        metadata: {
            version: 1,
            alg: 'sha512',
            enc: 'b64',
            sig: 'rsa2048'
        },
        transaction: {
            id: reqBody.transaction_id,
            expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            provider: reqBody.bic,
            amount: transactionData.amount,
            currency: transactionData.currency
        }
    }

    if (transactionData.period) {
        token.transaction.recurring = {
            period: transactionData.period,
            next: getNextRecurrance(new Date(Date.now()), transactionData.period).toISOString(),
            index: 0
        }
    } else {
        token.transaction.recurring = null
    }

    let signer = crypto.createSign('SHA512')
    signer.update(Buffer.from(JSON.stringify(token)))
    const signature = signer.sign(privkey)
    token.signatures = {
        vendor: signature.toString('base64'),
        vendor_key: pemKeyToRawKeyStr(pubkey)
    }

    return token
}


function generateVendorTokenMsg(transId, token, transactionData) {
    return {
        success: true,
        transaction_id: transId,
        response_url: `stp://localhost:${port}/api/stp/response/${transId}`,
        vendor: {
            name: 'STP Example Vendor',
            logo_url: 'https://i.insider.com/602ee9ced3ad27001837f2ac?width=700',
            address: 'Washington, Imaginary st. 123'
        },
        transaction: {
            amount: transactionData.amount,
            currency_code: transactionData.currency,
            recurrance: transactionData.period
        },
        token: Buffer.from(JSON.stringify(token)).toString('base64')
    }
}


app.post('/api/stp/request/:uuid', async (req, res) => {
    const uuid = req.params.uuid
    logMsg('ProviderHello', uuid, req.body)
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

    const token = generateVendorToken(req.body, currReq)
    const respMessage = generateVendorTokenMsg(transId, token, currReq)
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


function verifyToken(token) {
    let tokenCopy = JSON.parse(JSON.stringify(token))
    delete tokenCopy.signatures.provider
    delete tokenCopy.signatures.provider_key

    let verifier = crypto.createVerify('SHA512')
    verifier.update(Buffer.from(JSON.stringify(tokenCopy)))
    return verifier.verify(
        rawKeyStrToPemPubKey(token.signatures.provider_key),
        Buffer.from(token.signatures.provider, 'base64')
    )
}


function checkProviderTokenMsg(params) {
    if (!params.allowed) {
        return [ 'TRANSACTION_DECLINED', 'The transaction was declined by the user' ]
    }

    if (!params.token) {
        return [ 'TOKEN_NOT_FOUND', 'The transaction token is not found' ]
    }

    const token = JSON.parse(Buffer.from(params.token, 'base64'))
    if (!verifyToken(token)) {
        return [ 'TOKEN_INVALID', 'The transaction token has an invalid provider signature' ]
    }

    return [ null, null ]
}


app.post('/api/stp/response/:uuid', async (req, res) => {
    const uuid = req.params.uuid
    logMsg('ProviderToken', uuid, req.body)
    if (!(uuid in ongoingResponses)) {
        return res.sendStatus(400)
    }

    const [ err_code, err_msg ] = checkProviderTokenMsg(req.body)
    if (err_code) {
        return res.send({
            success: false,
            error_code: err_code,
            error_message: err_msg
        })
    }

    console.log('Transaction token:', JSON.parse(Buffer.from(req.body.token, 'base64')))
    return res.send({
        success: true
    })
})


app.listen(port, () => {
    console.log(`Vendor app listening on port http://localhost:${port}`)
})
