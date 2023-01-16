import crypto from 'crypto'

import commonUtils from '../common/utils.js'


/**
 * Constructs and signs the vendor STP token from the transaction data
 * @param {Object} transaction - The transaction data in an object
 * @param {Buffer} privkey - The private key of the vendor as a .pem Buffer
 * @param {Buffer} pubkey - The public key of the vendor as a .pem Buffer
 * @returns {Object} The vendor STP token (metadata, transaction, vendor signatures)
 */
function constructAndSignToken(transaction, privkey, pubkey) {
    let token = {
        metadata: {
            version: 1,
            alg: 'sha512',
            enc: 'b64',
            sig: 'rsa2048'
        },
        transaction: transaction
    }

    let signer = crypto.createSign('SHA512')
    signer.update(Buffer.from(JSON.stringify(token)))
    const signature = signer.sign(privkey)
    token.signatures = {
        vendor: signature.toString('base64'),
        vendor_key: commonUtils.pemKeyToRawKeyStr(pubkey)
    }

    return token
}

/**
 * Generates a new vendor STP token
 * @param {Object} reqBody - The content of the incomming `ProviderHello` message 
 * @param {string} reqBody.transaction_id - The ID of the transaction defined by the provider. Format: bic_id
 * @param {string} reqBody.bic - The Bank Identification Code (BIC) of the provider
 * @param {Object} transactionData - The transaction data
 * @param {number} transactionData.amount - The amount of the transaction 
 * @param {string} transactionData.currency - The currency code of the transaction
 * @param {string?} transactionData.period - The recurrance period of the transaction. One of: null, monthly, quarterly, annual
 * @param {Buffer} privkey - The private key of the vendor as a .pem Buffer
 * @param {Buffer} pubkey - The public key of the vendor as a .pem Buffer
 * @returns {Object} The vendor STP token (metadata, transaction, vendor signatures)
 */
function generateVendorToken(reqBody, transactionData, privkey, pubkey) {
    let transaction = {
        id: reqBody.transaction_id,
        expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        provider: reqBody.bic,
        amount: transactionData.amount,
        currency: transactionData.currency
    }

    if (transactionData.period) {
        transaction.recurring = {
            period: transactionData.period,
            next: commonUtils.getNextRecurrance(new Date(Date.now()), transactionData.period).toISOString(),
            index: 0
        }
    } else {
        transaction.recurring = null
    }

    return constructAndSignToken(transaction, privkey, pubkey)
}

/**
 * Generates a refreshed version of the given token
 * @param {Object} token - The original token 
 * @param {Buffer} privkey - The private key of the vendor as a .pem Buffer
 * @param {Buffer} pubkey - The public key of the vendor as a .pem Buffer
 * @returns {Object} The refreshed token
 */
function generateRefreshedToken(token, privkey, pubkey) {
    let transaction = JSON.parse(JSON.stringify(token.transaction))
    transaction.expiry = 
        commonUtils.getNextRecurrance(new Date(transaction.expiry), transaction.recurring.period).toISOString()
    transaction.recurring.next = 
        commonUtils.getNextRecurrance(new Date(transaction.recurring.next), transaction.recurring.period).toISOString()
    transaction.recurring.index += 1
    
    return constructAndSignToken(transaction, privkey, pubkey) 
}

/**
 * Generates the `VendorToken` message
 * @param {string} transId - The ID of the 2nd round trip of the transaction
 * @param {number} port - The port of the vendor server
 * @param {Object} token - The vendor STP token 
 * @param {Object} transactionData - The transaction data
 * @param {number} transactionData.amount - The amount of the transaction 
 * @param {string} transactionData.currency - The currency code of the transaction
 * @param {string?} transactionData.period - The recurrance period of the transaction. One of: null, monthly, quarterly, annual
 * @returns {Object} The `VendroToken` message
 */
function generateVendorTokenMsg(transId, port, token, transactionData) {
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

/**
 * Verifies the provider signature of a full STP token
 * @param {Object} token - The full STP token
 * @returns {boolean} The result of the verification
 */
function verifyToken(token) {
    let tokenCopy = commonUtils.copyObject(token)
    delete tokenCopy.signatures.provider
    delete tokenCopy.signatures.provider_key

    let verifier = crypto.createVerify('SHA512')
    verifier.update(Buffer.from(JSON.stringify(tokenCopy)))
    return verifier.verify(
        commonUtils.rawKeyStrToPemPubKey(token.signatures.provider_key),
        Buffer.from(token.signatures.provider, 'base64')
    )
}

/**
 * Checks the validity of the `ProviderToken` message
 * @param {Object} params - The `ProviderToken` message
 * @returns {[string?, string?]} The result of the check. `[ null, null ]` if the check return no errors, `[ err_code, err_msg ]` otherwise
 */
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

/**
 * Make a change request for a given token
 * @param {string} transaction_id - The ID of the transaction token. Format: bic_id
 * @param {string} change_verb - The change verb. One of: REFRESH, REVOKE
 * @param {Buffer} privkey - The private key of the vendor as a .pem Buffer
 * @param {Buffer} pubkey - The public key of the vendor as a .pem Buffer
 * @param {Object} tokens - Dictionary of all saved tokens. Key: `{string}` t_id, value: `{Object}` token
 * @param {Object} tokenChangeUrls - Dictionary of all saved token change URLs. Key: `{string}` t_id, value: `{string}` url
 * @returns {[string?, string?]} The result of the change request. `[ null, null ]` if the no errors, `[ err_code, err_msg ]` otherwise
 */
async function changeRequest(transaction_id, change_verb, privkey, pubkey, tokens, tokenChangeUrls) {
    const challenge = commonUtils.genChallenge(30)
    const res_1 = await fetch(tokenChangeUrls[transaction_id].replace('stp://', 'http://'), {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            transaction_id: transaction_id,
            challenge: challenge
        })
    })
    const providerVerifChall = await res_1.json()
    commonUtils.logMsg('ProviderVerifChall', providerVerifChall)
    if (!providerVerifChall.success) {
        return [ providerVerifChall.error_code, providerVerifChall.error_message ]
    }

    let vendorVerifChange = {}
    if (!commonUtils.verifyChallResponse(challenge, providerVerifChall.response, tokens[transaction_id].signatures.provider_key)) {
        vendorVerifChange = {
            success: false,
            error_code: 'AUTH_FAILED',
            error_message: 'The provider\'s response to the challenge was not appropriate',
        }
    } else {
        vendorVerifChange = {
            success: true,
            response: commonUtils.signChall(providerVerifChall.challenge, privkey),
            change_verb: change_verb
        }
        if (change_verb == 'REFRESH') {
            const refreshedToken = generateRefreshedToken(tokens[transaction_id], privkey, pubkey)
            vendorVerifChange.token = Buffer.from(JSON.stringify(refreshedToken)).toString('base64')
        }
    }
    const res_2 = await fetch(providerVerifChall.next_url.replace('stp://', 'http://'), {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(vendorVerifChange)
    })
    const providerAck = await res_2.json()
    commonUtils.logMsg('ProviderAck', providerAck)
    
    if (!vendorVerifChange.success) {
        return [ vendorVerifChange.error_code, vendorVerifChange.error_message ]
    }
    if (!providerAck.success) {
        return [ providerAck.error_code, providerAck.error_message ]
    }
    
    if (change_verb == 'REFRESH') {
        tokens[transaction_id] = JSON.parse(Buffer.from(providerAck.token, 'base64'))
    } else if (change_verb == 'REVOKE') { 
        delete tokens[transaction_id]
        delete tokenChangeUrls[transaction_id]
    }
    return [ null, null ]
}

export default {
    generateVendorToken, generateVendorTokenMsg, checkProviderTokenMsg, changeRequest
}
