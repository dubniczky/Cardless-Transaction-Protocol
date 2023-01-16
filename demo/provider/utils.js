import crypto from 'crypto'

import commonUtils from '../common/utils.js'


/**
 * Generates the `ProviderHello` message
 * @param {string} url - The URL, where the message will be sent 
 * @param {Buffer} privkey - The private key of the provider as a .pem Buffer
 * @returns {Object} The `ProviderHello` message
 */
function generateProviderHelloMsg(url, privkey) {
    const pin = crypto.randomInt(1000, 10000)
    const t_id = 'STPEXPROV_' + crypto.randomInt(10 ** 9, 10 ** 10)
    const url_token = commonUtils.cutIdFromUrl(url)
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

/**
 * Sends `ProviderHello` and processes the reponse (`VendorToken` message)
 * @param {string} url - URL to send the message to
 * @param {Object} providerHello - The `ProviderHello` message
 * @returns {[Object?, string?, string?]} `[ VendorToken, null, null ]` if the no errors, `[ null, err_code, err_msg ]` otherwise
 */
async function getVendorTokenMsg(url, providerHello) {
    let vendor_res = await fetch(url.replace('stp://', 'http://'), {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(providerHello)
    })

    if (vendor_res.status != 200) {
        const error_msg = await vendor_res.text()
        return [ null, vendor_res.status, error_msg]
    }

    vendor_res = await vendor_res.json()
    commonUtils.logMsg('VendorToken', vendor_res)
    if (!vendor_res.success) {
        return [ null, vendor_res.error_code, vendor_res.error_message ]
    }

    return [ vendor_res, null, null ]
}

/**
 * Verifies the vendor STP token
 * @param {Object} token - The vendor STP token 
 * @returns {boolean} The result of the verification
 */
function verifyVendorToken(token) {
    let tokenCopy = JSON.parse(JSON.stringify(token))
    delete tokenCopy.signatures

    let verifier = crypto.createVerify('SHA512')
    verifier.update(Buffer.from(JSON.stringify(tokenCopy)))
    return verifier.verify(
        commonUtils.rawKeyStrToPemPubKey(token.signatures.vendor_key),
        Buffer.from(token.signatures.vendor, 'base64')
    )
}

/**
 * Signes the vendor STP token, creating the full STP token
 * @param {Object} token - The vendor STP token
 * @param {Buffer} privkey - The private key of the provider as a .pem Buffer
 * @param {Buffer} pubkey - The public key of the provider as a .pem Buffer
 * @returns {Object} The full STP token
 */
function signToken(token, privkey, pubkey) {
    let signer = crypto.createSign('SHA512')
    signer.update(Buffer.from(JSON.stringify(token)))
    const signature = signer.sign(privkey)

    let signedToken = commonUtils.copyObject(token)
    signedToken.signatures.provider = signature.toString('base64')
    signedToken.signatures.provider_key = commonUtils.pemKeyToRawKeyStr(pubkey)
    return signedToken
}

/**
 * Sends the `ProviderToken` message and processes the response (`VendorAck` message)
 * @param {string} url - The URL to send the message to 
 * @param {Object} providerTokenMsg - The `ProviderToken` message
 * @returns {[string?, string?]} `[ null, null ]` if the no errors, `[ err_code, err_msg ]` otherwise
 */
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
    commonUtils.logMsg('VendorAck', vendor_res)
    if (!vendor_res.success) {
        return [ vendor_res.error_code, vendor_res.error_message ]
    }

    return [ null, null ]
}

/**
 * Check whether the refreshed token is valid
 * @param {Object} oldToken - The previous token 
 * @param {Object} newToken - The refreshed token
 * @returns {boolean} `true` if the refreshed token is valid, `false` otherwise
 */
function isRefreshedTokenValid(oldToken, newToken) {
    if (!oldToken.transaction.recurring || !newToken.transaction.recurring) {
        return false;
    }

    let oldTokenCopy = commonUtils.copyObject(oldToken)
    let newTokenCopy = commonUtils.copyObject(newToken)

    delete oldTokenCopy.signatures
    delete oldTokenCopy.transaction.expiry // Skip equality check for now
    delete oldTokenCopy.transaction.recurring.next // Skip equality check for now
    oldTokenCopy.transaction.recurring.index += 1

    delete newTokenCopy.signatures
    delete newTokenCopy.transaction.expiry // Skip equality check for now
    delete newTokenCopy.transaction.recurring.next // Skip equality check for now

    return JSON.stringify(oldTokenCopy) == JSON.stringify(newTokenCopy)
}

export default {
    generateProviderHelloMsg, getVendorTokenMsg, verifyVendorToken, signToken, sendProviderTokenMsg, isRefreshedTokenValid
}
