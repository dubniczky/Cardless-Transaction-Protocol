import crypto from 'crypto'

import { protocolState, keys, getToken } from './protocolState.js'
import utils from '../common/utils.js'

/**
 * Validates if a given ongoing request exists
 * @param {Repsonse} res - The response object
 * @param {string} uuid - The UUID of the request
 * @returns {boolean} Whether the request exists
 */
function isOngoingRequest(res, uuid) {
    return utils.validateRes(res, uuid in protocolState.ongoing.requests)
}

/**
 * Validates if a given ongoing response exists
 * @param {Repsonse} res - The response object
 * @param {string} uuid - The UUID of the response
 * @returns {boolean} Whether the response exists
 */
function isOngoingResponse(res, uuid) {
    return utils.validateRes(res, protocolState.ongoing.responses[uuid])
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
 * Validates if the URL is signed corrently
 * @param {Repsonse} res - The response object
 * @param {string} uuid - The UUID in the URL (the part which is signed)
 * @param {string} signature - Base64 string of the signature
 * @returns {boolean} Whether the URL is signed corrently
 */
function verifyUrlSignature(res, uuid, signature) {
    return utils.validateRes(res, crypto.verify(null, Buffer.from(uuid), keys.bankPublic, new Buffer(signature, 'base64')),
        'INVALID_SIGNATURE', 'url_signature is not a valid signature of the provider')
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
 * Validates if a given token is recurring
 * @param {Repsonse} res - The response object
 * @param {string} id - The transaction ID of the token
 * @returns {boolean} Whether the token is recurring. Returns `false` if the token does not exist
 */
function isTokenRecurring(res, id) {
    return utils.validateRes(res, getToken(id).transaction.recurring,
        'NON_RECURRING', 'Cannot refresh non-recurring transaction token')
}

/**
 * Validates if the `ProviderVerifNotify` message is correct
 * @param {Request} req - The request object (`ProviderVerifNotify` message)
 * @param {Response} res - The response object
 * @param {string} id - The transaction ID of the notification
 * @param {string} challenge - The challenge (which is signed in the `ProviderVerifNotify` message) as a base64 string
 * @returns {boolean} Whether the `ProviderVerifNotify` message is correct
 */
function checkProviderVerifNotify(req, res, id, challenge) {
    if (!utils.validateRes(res, req.body.success)) {
        return false
    }

    return utils.validateRes(res,
        utils.verifyChallResponse(challenge, req.body.response, getToken(id).signatures.provider_key),
        'AUTH_FAILED', 'The provider\'s response to the challenge was not appropriate')
}

/**
 * Validates if the `ProviderTokenMsg` message is correct
 * @param {Request} req - The request object (`ProviderTokenMsg` message)
 * @param {Response} res - The response object
 * @returns {boolean} Whether the `ProviderTokenMsg` message is correct
 */
function checkProviderTokenMsg(req, res) {
    if (!utils.validateRes(res, req.body.allowed, 'TRANSACTION_DECLINED', 'The transaction was declined by the user')) {
        return false
    }

    if (!utils.validateRes(res, req.body.token, 'TOKEN_NOT_FOUND', 'The transaction token is not found')) {
        return false
    }

    const token = utils.base64ToObject(req.body.token)
    return utils.validateRes(res, utils.verifyProviderSignatureOfToken(token),
        'TOKEN_INVALID', 'The transaction token has an invalid provider signature')
}

/**
 * Validates if the `ProviderVerifChall` message is correct
 * @param {Object} providerVerifChall - The `ProviderVerifChall` message
 * @returns {[string, string]?} `[error_code, error_message]` if not correct, otherwise `null`
 */
function checkProviderVerifChall(providerVerifChall) {
    if (providerVerifChall.HTTP_error_code) {
        return [ providerVerifChall.HTTP_error_code, providerVerifChall.HTTP_error_msg ]
    }
    if (!providerVerifChall.success) {
        return [ providerVerifChall.error_code, providerVerifChall.error_message ]
    }

    return null
}

/**
 * Validates if the `ProviderAck` message is correct
 * @param {Object} providerAck - The `ProviderAck` message
 * @param {Object} vendorVerifChange - The `VendorVerifChange` message
 * @returns {[string, string]?} `[error_code, error_message]` if not correct, otherwise `null`
 */
function checkProviderAck(providerAck, vendorVerifChange) {
    if (providerAck.HTTP_error_code) {
        return [ providerAck.HTTP_error_code, providerAck.HTTP_error_msg ]
    }
    if (!vendorVerifChange.success) {
        return [ vendorVerifChange.error_code, vendorVerifChange.error_message ]
    }
    if (!providerAck.success) {
        return [ providerAck.error_code, providerAck.error_message ]
    }

    return null
}

export default {
    isOngoingRequest, isOngoingResponse, isOngoingChallenge, verifyUrlSignature, doesTokenExist, isTokenRecurring,
    checkProviderVerifNotify, checkProviderTokenMsg, checkProviderVerifChall, checkProviderAck
}
