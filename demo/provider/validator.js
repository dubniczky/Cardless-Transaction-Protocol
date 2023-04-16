import { protocolState, getToken } from './protocolState.js'
import utils from '../common/utils.js'

/**
 * Validates if a given ongoing transaction negotiation exists
 * @param {Repsonse} res - The response object
 * @param {string} id - The transaction ID
 * @returns {boolean} Whether the transaction negotiation exists
 */
function isOngoingTransaction(res, id) {
    return utils.validateRes(res, id in protocolState.ongoing.transactions)
}

/**
 * Validates if a given ongoing challenge exists
 * @param {Repsonse} res - The response object
 * @param {string} id - The transaction ID associated with the challenge
 * @returns {boolean} Whether the challenge exists
 */
function isOngoingChallenge(res, id) {
    return utils.validateRes(res, id in protocolState.ongoing.challenges)
}

/**
 * Validates if a given token exists
 * @param {Repsonse} res - The response object
 * @param {string} id - The transaction ID of the token
 * @returns {boolean} Whether the token exists
 */
function doesTokenExist(res, id) {
    return utils.validateRes(res, id in protocolState.tokens,
        'ID_NOT_FOUND', 'The given transaction_id has no associated tokens')
}

/**
 * Validates if the user input in the token negotiation is correct
 * @param {Request} req - The request object
 * @param {Response} res - The response object
 * @param {Object} transaction - The transaction data
 * @param {string} transaction.token - The vendor STP token as a base64 string
 * @param {string} transaction.response_url - The response URL, where the 2nd phase of the negotiatin should go
 * @param {number} transaction.pin - The PIN necessary to accept the token
 * @param {Object} vendorToken - The vendor STP token
 * @returns {boolean} Whether user input is correct
 */
function checkUserInput(req, res, transaction, vendorToken) {
    if (!utils.validateRes(res, req.body.decision === 'accept', 'USER_DECLINED', 'The user declined the transaction', 'allowed')) {
        return false
    }
    if (!utils.validateRes(res, req.body.pin !== transaction.pin, 'INCORRECT_PIN', 'The user entered an incorrect pin', 'allowed')) {
        return false
    }
    
    return utils.validateRes(res, utils.verifyVendorSignatureOfToken(vendorToken),
        'INCORRECT_SIGNATURE', 'The vendor signature of the token is incorrect')
}

/**
 * Validates if the `VendorVerifChange` message is correct
 * @param {Request} req - The request object (`VendorVerifChange` message)
 * @param {Response} res - The response object
 * @param {string} id - The transaction ID of the change request
 * @param {string} challenge - The challenge (which is signed in the `VendorVerifChange` message) as a base64 string
 * @returns {boolean} Whether the `VendorVerifChange` message is correct
 */
function checkVendorVerifChange(req, res, id, challenge) {
    if (!utils.validateRes(res, req.body.success, req.body.error_code, req.body.error_message)) {
        return false
    }
    
    return utils.validateRes(res, utils.verifyChallResponse(challenge, req.body.response, getToken(id).signatures.vendor_key),
        'AUTH_FAILED', 'The vendor\'s response to the challenge was not appropriate')
}

/**
 * Validates if the `VendorVerifChall` message is correct
 * @param {Object} vendorVerifChall - The `VendorVerifChall` message
 * @returns {[string, string]?} `[error_code, error_message]` if not correct, otherwise `null`
 */
function checkVendorVerifChall(vendorVerifChall) {
    if (vendorVerifChall.HTTP_error_code) {
        return [ vendorVerifChall.HTTP_error_code, vendorVerifChall.HTTP_error_msg ]
    }
    if (!vendorVerifChall.success) {
        return [ vendorVerifChall.error_code, vendorVerifChall.error_message ]
    }

    return null
}

/**
 * Validates if the `VendorAck` message is correct
 * @param {Object} vendorAck - The `VendorAck` message
 * @param {Object} providerVerifNotify - The `ProviderVerifNotify` message
 * @returns {[string, string]?} `[error_code, error_message]` if not correct, otherwise `null`
 */
function checkVendorAck(vendorAck, providerVerifNotify) {
    if (vendorAck.HTTP_error_code) {
        return [ vendorAck.HTTP_error_code, vendorAck.HTTP_error_msg ]
    }
    if (!providerVerifNotify.success) {
        return [ providerVerifNotify.error_code, providerVerifNotify.error_message ]
    }
    if (!vendorAck.success) {
        return [ vendorAck.error_code, vendorAck.error_message ]
    }

    return null
}


export default {
    isOngoingTransaction, isOngoingChallenge, doesTokenExist, checkUserInput, checkVendorVerifChange,
    checkVendorVerifChall, checkVendorAck
}
