import express from 'express'
import crypto from 'crypto'
import fs from 'fs'

const app = express()
const port = 8000

const ongoingTransactions = {}
const privkey = fs.readFileSync('../keys/bank_privkey.pem')
const pubkey = fs.readFileSync('../keys/bank_pubkey.pem')


app.set('views', 'views')
app.set('view engine', 'ejs')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/', express.static('public'))


function logMsg(msgName, content) {
    console.log(`${msgName} (vendor -> provider):`)
    console.log(content)
    console.log()
}


function generateProviderHelloMsg(url) {
    const pin = crypto.randomInt(1000, 10000)
    const t_id = 'STPEXPROV_' + crypto.randomInt(10 ** 9, 10 ** 10)
    const url_token = url.substring(url.lastIndexOf('/') + 1)
    const url_signature = crypto.sign(null, Buffer.from(url_token), privkey).toString('base64')
    return {
        version: 'v1',
        bank_name: 'STP_Example_Provider',
        bic: 'STPEXPROV',
        random: crypto.randomBytes(30).toString('base64'),
        transaction_id: t_id,
        url_signature: url_signature,
        verification_pin: pin
    }
}


async function getVendorTokenMsg(url, transInitializer) {
    let vendor_res = await fetch(url.replace('stp://', 'http://'), {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(transInitializer)
    })

    if (vendor_res.status != 200) {
        const error_msg = await vendor_res.text()
        return [ null, vendor_res.status, error_msg]
    }

    vendor_res = await vendor_res.json()
    logMsg('VendorToken', vendor_res)
    if (!vendor_res.success) {
        return [ null, vendor_res.error_code, vendor_res.error_message ]
    }

    return [ vendor_res, null, null ]
}


app.post('/start', async (req, res) => {
    if (!req.body.url) {
        return res.sendStatus(400)
    }
    
    const providerHello = generateProviderHelloMsg(req.body.url)
    const [ vendor_res, error_code, error_msg ] = await getVendorTokenMsg(req.body.url, providerHello)
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
        t_id: providerHello.transaction_id
    })
})


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


function verifyVendorToken(token) {
    let tokenCopy = JSON.parse(JSON.stringify(token))
    delete tokenCopy.signatures

    let verifier = crypto.createVerify('SHA512')
    verifier.update(Buffer.from(JSON.stringify(tokenCopy)))
    return verifier.verify(
        rawKeyStrToPemPubKey(token.signatures.vendor_key),
        Buffer.from(token.signatures.vendor, 'base64')
    )
}


function signToken(token) {
    let signer = crypto.createSign('SHA512')
    signer.update(Buffer.from(JSON.stringify(token)))
    const signature = signer.sign(privkey)

    let signedToken = token
    signedToken.signatures.provider = signature.toString('base64')
    signedToken.signatures.provider_key = pemKeyToRawKeyStr(pubkey)
    return signedToken
}


async function sendProviderTokenMsg(url, providerTokenMsg) {
    let vendor_res = await fetch(url.replace('stp://', 'http://'), {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(providerTokenMsg)
    })

    if (!providerTokenMsg.allowed) {
        return [ providerTokenMsg.error_code, providerTokenMsg.error_message ]
    }

    if (vendor_res.status != 200) {
        const error_msg = await vendor_res.text()
        return [vendor_res.status, error_msg ]
    }

    vendor_res = await vendor_res.json()
    logMsg('VendorAck', vendor_res)
    if (!vendor_res.success) {
        return [ vendor_res.error_code, vendor_res.error_message ]
    }

    return [ null, null ]
}


app.post('/verify', async (req, res) => {
    if (!(req.body.t_id in ongoingTransactions)) {
        return res.sendStatus(400)
    }

    const transaction = ongoingTransactions[req.body.t_id]
    const vendorToken = JSON.parse(Buffer.from(transaction.token, 'base64'))
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
    } else if (!verifyVendorToken(vendorToken)) {
        providerTokenMsg = {
            allowed: false,
            error_code: 'INCORRECT_SIGNATURE',
            error_message: 'The vendor signature of the token is incorrect'
        }
    } else {
        token = signToken(vendorToken)
        providerTokenMsg = {
            allowed: true,
            token: Buffer.from(JSON.stringify(token)).toString('base64')
        }
    }

    const [ error_code, error_msg ] = await sendProviderTokenMsg(transaction.response_url, providerTokenMsg)
    if (error_code) {
        return res.render('error', {
            error_code: error_code,
            error_msg: error_msg
        })
    }

    return res.render('result', {
        token: JSON.stringify(token, null, 4)
    })
})


app.listen(port, () => {
    console.log(`Provider app listening on port http://localhost:${port}`)
})
