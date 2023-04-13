import crypto from 'crypto'

import { protocolState, keys, getToken } from './protocolState.js'
import utils from '../common/utils.js'


function isOngoingRequest(res, uuid) {
    return utils.validateRes(res, uuid in protocolState.ongoing.requests)
}


function isOngoingResponse(res, uuid) {
    return utils.validateRes(res, protocolState.ongoing.responses[uuid])
}


function isOngoingChallenge(res, id) {
    return utils.validateRes(res, id in protocolState.ongoing.challenges)
}


function verifyUrlSignature(res, uuid, signature) {
    return utils.validateRes(res, crypto.verify(null, Buffer.from(uuid), keys.bankPublic, new Buffer(signature, 'base64')),
        'INVALID_SIGNATURE', 'url_signature is not a valid signature of the provider')
}


function doesTokenExist(res, id) {
    return utils.validateRes(res, id in protocolState.tokens,
        'ID_NOT_FOUND', 'The given transaction_id has no associated tokens')
}


function isTokenRecurring(res, id) {
    return utils.validateRes(res, getToken(id).transaction.recurring,
        'NON_RECURRING', 'Cannot refresh non-recurring transaction token')
}


function checkProviderVerifNotify(req, res, id, challenge) {
    if (!utils.validateRes(res, req.body.success)) {
        return false
    }

    return utils.validateRes(res,
        utils.verifyChallResponse(challenge, req.body.response, getToken(id).signatures.provider_key),
        'AUTH_FAILED', 'The provider\'s response to the challenge was not appropriate')
}


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


function checkProviderVerifChall(providerVerifChall) {
    if (providerVerifChall.HTTP_error_code) {
        return [ providerVerifChall.HTTP_error_code, providerVerifChall.HTTP_error_msg ]
    }
    if (!providerVerifChall.success) {
        return [ providerVerifChall.error_code, providerVerifChall.error_message ]
    }

    return null
}


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
