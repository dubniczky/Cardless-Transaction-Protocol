import falcon from '../common/falcon.js'


export const protocolState = {
    ongoing: {
        transactions: {},
        modifications: []
    },
    tokens: {},
    tokenRevisionUrls: {}
}

export const keys = {
    private: await falcon.readKey('../keys/bank_privkey.json'),
    public: await falcon.readKey('../keys/bank_pubkey.json')
}

/**
 * Returns the tranaction object with the given ID. The object is removed from the queue
 * @param {string} id - The transaction's ID
 * @returns {Object} The tranaction object
 */
export function popOngoingTransaction(id) {
    const transaction = protocolState.ongoing.transactions[id]
    delete protocolState.ongoing.transactions[id]
    return transaction
}

/**
 * Returns the modification data with the given ID. The modification data is removed from the queue
 * @param {string?} id - The transaction ID associated with the modification data. If not given, the last modification is popped
 * @returns {Object?} The modification data. `null` if none found
 */
export function popOngoingModification(id = null) {
    if (id) {
        const modifIndex = protocolState.ongoing.modifications.findIndex((elem) => elem.id == id)
        if (modifIndex === -1) {
            return null
        }

        const modification = protocolState.ongoing.modifications[modifIndex]
        protocolState.ongoing.modifications.splice(modifIndex, 1)
        return modification
    }

    if (protocolState.ongoing.modifications.length == 0) {
        return null
    }

    return protocolState.ongoing.modifications[protocolState.ongoing.modifications.length - 1]
}

/**
 * Returns a list of all STP tokens
 * @returns {Object[]} The STP token
 */
export function getAllTokensList() {
    return Object.values(protocolState.tokens)
}

/**
 * Returns the token with the given ID
 * @param {string} id - The transaction ID associated with the token
 * @returns {Object} The STP token
 */
export function getToken(id) {
    return protocolState.tokens[id]
}
