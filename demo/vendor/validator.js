import { getProtocolState, getKeys } from './protocolState'
import utils from '../common/utils.js'


function isOngoingRequest(res, uuid) {
    return utils.validateRes(res, uuid in getProtocolState().ongoing.requests)
}


function isOngoingResponse(res, uuid) {
    return utils.validateRes(res, getProtocolState().ongoing.responses[uuid])
}


function isOngoingChallenge(res, id) {
    return utils.validateRes(res, id in getProtocolState().ongoing.challenges)
}


function verifyUrlSignature(res, uuid, signature) {
    return utils.validateRes(res, crypto.verify(null, Buffer.from(uuid), getKeys().bankPublic, new Buffer(signature, 'base64')),
        'INVALID_SIGNATURE', 'url_signature is not a valid signature of the provider')
}


function doesTokenExist(res, id) {
    return utils.validateRes(res, id in getProtocolState().tokens,
        'ID_NOT_FOUND', 'The given transaction_id has no associated tokens')
}


function isTokenRecurring(res, id) {
    return utils.validateRes(res, getProtocolState().tokens[id]?.transaction?.recurring,
        'NON_RECURRING', 'Cannot refresh non-recurring transaction token')
}


function checkProviderVerifNotify(req, res, id, challenge) {
    if (!utils.validateRes(res, req.body.success)) {
        return false
    }

    return utils.validateRes(res,
        utils.verifyChallResponse(challenge, req.body.response, getProtocolState().tokens[id].signatures.provider_key),
        'AUTH_FAILED', 'The provider\'s response to the challenge was not appropriate')
}


function checkProviderTokenMsg(req, res) {
    if (!utils.validateRes(res, req.body.allowed, 'TRANSACTION_DECLINED', 'The transaction was declined by the user')) {
        return false
    }

    if (!utils.validateRes(res, req.body.token, 'TOKEN_NOT_FOUND', 'The transaction token is not found')) {
        return false
    }

    const token = utils.base64ToObject(req.body.token, 'base64')
    return utils.validateRes(res, utils.verifyProviderSignatureOfToken(token),
        'TOKEN_INVALID', 'The transaction token has an invalid provider signature')
}


export default {
    isOngoingRequest, isOngoingResponse, isOngoingChallenge, verifyUrlSignature, doesTokenExist, isTokenRecurring,
    checkProviderVerifNotify, checkProviderTokenMsg
}
