import crypto from 'crypto'

import utils from '../common/utils.js'
import {getProtocolState, getKeys} from './protocolState.js'

/**
 * Convert recurring option to period (one_time -> null)
 * @param {string} recurringOption - The recurring options
 * @returns {string} The recurring period
 */
function recurringOptionToPeriod(recurringOption) {
    if (recurringOption === 'one_time') {
        return null
    }
    return recurringOption
}

/**
 * Convert recurring period to option (null -> one_time)
 * @param {string} recurringPeriod - The recurring period
 * @returns {string} The recurring option
 */
function recurringPeriodToOption(recurringPeriod) {
    if (recurringPeriod) {
        return recurringPeriod
    }
    return 'one_time'
}

/**
 * Generate STP URL from request
 * @param {Request} req - The form POST request. Contains fields: `amount`, `currency`, `recurring`
 * @returns {string} The UUID of the generated URL
 */
function generateNewTransactionUrl(req) {
    const uuid = crypto.randomUUID()
    getProtocolState().ongoing.requests[uuid] = {
        amount: req.body.amount,
        currency: req.body.currency,
        period: recurringOptionToPeriod(req.body.recurring)
    }
    console.log(`Transaction data:\n${uuid}: ${JSON.stringify(getProtocolState().ongoing.requests[uuid])}\n`)
    return uuid
}

/**
 * Cosntruct and send the `VendorToken` message
 * @param {Request} req - The incomming request
 * @param {Response} res - The response to send the message to
 * @param {string} uuid - The UUID of the incomming STP URL
 * @param {number} port - The port of the vendor server 
 */
function sendVendorTokenMsg(req, res, uuid, port) {
    getProtocolState().ongoing.requestPins[uuid] = req.body.verification_pin
    const currReq = popOngoingRequest(uuid)
    const transId = crypto.randomUUID()
    getProtocolState().ongoing.responses[transId] = true

    const token = generateVendorToken(req.body, currReq, privkey, pubkey)
    const respMessage = generateVendorTokenMsg(transId, port, token, currReq)
    res.send(respMessage)
}

/**
 * Returns the PIN associated with given UUID
 * @param {Response} res - The response to send the PIN to
 * @param {string} uuid - The UUID of the request, from where the PIN is needed 
 * @returns {string} The PIN as a string
 */
async function waitAndSendRequestPin(res, uuid) {
    if (!(uuid in getProtocolState().ongoing.requests || uuid in getProtocolState().ongoing.requestPins)) {
        res.sendStatus(400)
        return
    }

    while (!(uuid in getProtocolState().ongoing.requestPins)) {
        await utils.sleep(100)
    }

    const pin = popOngoingRequestPin(uuid)
    res.send(pin)
}

/**
 * Handles `ProviderToken` message and sends the `VendorAck` message
 * @param {Request} req - The `ProviderToken` request
 * @param {Response} res - The `VendorAck` response
 * @param {string} uuid - The UUID of the response
 * @param {number} port - The port of the vendor server 
 */
function sendVendorAck(req, res, uuid, port) {
    delete getProtocolState().ongoing.responses[uuid]
    const token = utils.base64ToObject(req.body.token, 'base64')
    getProtocolState().tokens[token.transaction.id] = token
    getProtocolState().tokenChangeUrls[token.transaction.id] = req.body.change_url
    console.log('Transaction token:', token)
    res.send({
        success: true,
        notify_url: `stp://localhost:${port}/api/stp/notify`
    })
}

/**
 * Responds to the `ProviderChall` with the `VendorVerifChall`
 * @param {Request} req - The `ProviderChall` request
 * @param {Response} res - The `VendorVerifChall` response
 */
function sendVendorVerifChall(req, res) {
    const challenge = utils.genChallenge(30)
    getProtocolState().ongoing.challenges[req.body.transaction_id] = challenge
    res.send({
        success: true,
        response: utils.signChall(req.body.challenge, keys.private),
        challenge: challenge,
        next_url: `stp://localhost:${port}/api/stp/notify_next/${req.body.transaction_id}`
    })
}

/**
 * Handles successful revoke notification
 * @param {Response} res - The `VendorAck` response 
 * @param {string} id - The transaction ID related to the notification
 */
function handleRevokeNotification(res, id) {
    delete getProtocolState().tokens[id]
    delete getProtocolState().tokenChangeUrls[id]
    res.send({ success: true })
}

/**
 * Handles successful finished modification notification
 * @param {Request} req - The `ProviderVerifNotify` request
 * @param {Response} res - The `VendorAck` response
 * @param {string} id - The transaction ID related to the notification
 */
function handleFinishModifyNotification(req, res, id) {
    if (req.body.modification_status == 'ACCEPTED') {
        getProtocolState().tokens[id] = utils.base64ToObject(req.body.token, 'base64')
    }
    res.send({ success: true })
}

/**
 * Handles unknown notification verb
 * @param {Response} res - The `VendorAck` response
 */
function handleUnknownNotification(res) {
    res.send({
        success: false,
        error_code: 'UNKNOWN_NOTIFY_VERB',
        error_message: 'Unsupported notify_verb'
    })
}

/**
 * Constructs and signs the vendor STP token from the transaction data
 * @param {Object} transaction - The transaction data in an object
 * @returns {Object} The vendor STP token (metadata, transaction, vendor signatures)
 */
function constructAndSignToken(transaction) {
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
    const signature = signer.sign(getKeys().private)
    token.signatures = {
        vendor: signature.toString('base64'),
        vendor_key: utils.pemKeyToRawKeyStr(getKeys().public)
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
 * @returns {Object} The vendor STP token (metadata, transaction, vendor signatures)
 */
function generateVendorToken(reqBody, transactionData) {
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
            next: utils.getNextRecurrance(Date.now(), transactionData.period),
            index: 0
        }
    } else {
        transaction.recurring = null
    }

    return constructAndSignToken(transaction)
}

/**
 * Generates a refreshed version of the given token
 * @param {Object} token - The original token
 * @returns {Object} The refreshed token
 */
function generateRefreshedToken(token) {
    let transaction = JSON.parse(JSON.stringify(token.transaction))
    transaction.expiry = 
        utils.getNextRecurrance(transaction.expiry, transaction.recurring.period)
    transaction.recurring.next = 
        utils.getNextRecurrance(transaction.recurring.next, transaction.recurring.period)
    transaction.recurring.index += 1
    
    return constructAndSignToken(transaction) 
}

/**
 * Generates the modified token
 * @param {Object} token - The original token 
 * @param {Object} modificationData - The modification data
 * @param {number} modificationData.amount - The amount of the modification 
 * @param {string} modificationData.currency - The currency code of the modification
 * @param {string?} modificationData.period - The recurrance period of the modification. One of: null, monthly, quarterly, annual
 * @returns {Object} The modified token
 */
function generateModifiedToken(token, modificationData) {
    let transaction = JSON.parse(JSON.stringify(token.transaction))
    transaction.amount = modificationData.amount
    transaction.currency = modificationData.currency
    if (modificationData.period) {
        transaction.recurring = {
            period: modificationData.period,
            next: utils.getNextRecurrance(Date.now(), modificationData.period),
            index: 0
        }
    } else {
        transaction.recurring = null
    }
    
    return constructAndSignToken(transaction)
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
        token: utils.objectToBase64(token)
    }
}


function generateVendorVerifChange(transaction_id, challenge, providerVerifChall, change_verb, modificationData) {
    if (!utils.verifyChallResponse(challenge, providerVerifChall.response, getProtocolState().tokens[transaction_id].signatures.provider_key)) {
        return {
            success: false,
            error_code: 'AUTH_FAILED',
            error_message: 'The provider\'s response to the challenge was not appropriate',
        }
    }

    const vendorVerifChange = {
        success: true,
        response: utils.signChall(providerVerifChall.challenge, getKeys().private),
        change_verb: change_verb
    }
    const token = getProtocolState().tokens[transaction_id]
    switch (change_verb) {
        case 'REFRESH':
            vendorVerifChange.token = utils.objectToBase64(generateRefreshedToken(token))
            break
        case 'MODIFY':
            vendorVerifChange.modification = modificationData
            vendorVerifChange.token = utils.objectToBase64(generateModifiedToken(token, modificationData))
    }
    return vendorVerifChange
}


function handleSuccessfulChange(transaction_id, providerAck, change_verb) {
    if (change_verb == 'REFRESH') {
        getProtocolState().tokens[transaction_id] = utils.base64ToObject(providerAck.token, 'base64')
    } else if (change_verb == 'REVOKE') {
        delete getProtocolState().tokens[transaction_id]
        delete getProtocolState().tokenChangeUrls[transaction_id]
    } else if (change_verb == 'MODIFY') { 
        if (providerAck.modification_status == 'ACCEPTED') {
            getProtocolState().tokens[transaction_id] = utils.base64ToObject(providerAck.token, 'base64')
        }
    }
}


/**
 * Make a change request for a given token
 * @param {string} transaction_id - The ID of the transaction token. Format: bic_id
 * @param {string} change_verb - The change verb. One of: REFRESH, REVOKE
 * @param {Object?} modificationData - The modification data
 * @param {number} modificationData.amount - The amount of the modification 
 * @param {string} modificationData.currency - The currency code of the modification
 * @param {string?} modificationData.period - The recurrance period of the modification. One of: null, monthly, quarterly, annual
 * @returns {[string?, string?]} The result of the change request. `[ null, null ]` if the no errors, `[ err_code, err_msg ]` otherwise
 */
async function changeRequest(transaction_id, change_verb, modificationData = null) {
    const challenge = utils.genChallenge(30)
    const providerVerifChall = await utils.postStpRequest(tokenChangeUrls[transaction_id], {
        transaction_id: transaction_id,
        challenge: challenge
    })
    utils.logMsg('ProviderVerifChall', providerVerifChall)
    if (providerVerifChall.HTTP_error_code) {
        return [ providerVerifChall.HTTP_error_code, providerVerifChall.HTTP_error_msg ]
    }
    if (!providerVerifChall.success) {
        return [ providerVerifChall.error_code, providerVerifChall.error_message ]
    }

    const vendorVerifChange = generateVendorVerifChange(transaction_id, challenge, providerVerifChall, change_verb, modificationData)
    const providerAck = await utils.postStpRequest(providerVerifChall.next_url, vendorVerifChange)
    utils.logMsg('ProviderAck', providerAck)
    if (providerAck.HTTP_error_code) {
        return [ providerAck.HTTP_error_code, providerAck.HTTP_error_msg ]
    }
    if (!vendorVerifChange.success) {
        return [ vendorVerifChange.error_code, vendorVerifChange.error_message ]
    }
    if (!providerAck.success) {
        return [ providerAck.error_code, providerAck.error_message ]
    }
    
    handleSuccessfulChange(transaction_id, providerAck, change_verb)
    return [ null, null ]
}

export default {
    recurringOptionToPeriod, recurringPeriodToOption, generateNewTransactionUrl, sendVendorTokenMsg, waitAndSendRequestPin,
    sendVendorAck, sendVendorVerifChall, handleRevokeNotification, handleFinishModifyNotification, handleUnknownNotification,
    changeRequest
}
