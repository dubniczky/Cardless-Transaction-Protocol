import { getProtocolState } from './protocolState'
import utils from '../common/utils.js'


function isOngoingTransaction(res, id) {
    return utils.validateRes(res, id in getProtocolState().ongoing.transactions)
}


function isOngoingChallenge(res, id) {
    return utils.validateRes(res, id in getProtocolState().ongoing.challenges)
}


function doesTokenExist(res, id) {
    return utils.validateRes(res, id in getProtocolState().tokens,
        'ID_NOT_FOUND', 'The given transaction_id has no associated tokens')
}


function checkUserInput(req, res, vendorToken) {
    if (!utils.validateRes(res, req.body.decision === 'accept', 'USER_DECLINED', 'The user declined the transaction', 'allowed')) {
        return false
    }
    if (!utils.validateRes(res, req.body.pin !== transaction.pin, 'INCORRECT_PIN', 'The user entered an incorrect pin', 'allowed')) {
        return false
    }
    
    return utils.validateRes(res, utils.verifyVendorSignatureOfToken(vendorToken),
        'INCORRECT_SIGNATURE', 'The vendor signature of the token is incorrect')
}


export default {
    isOngoingTransaction, isOngoingChallenge, doesTokenExist, checkUserInput
}
