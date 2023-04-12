const protocolState = {
    ongoing: {
        transactions: {},
        challenges: {},
        modifications: []
    },
    tokens: {},
    tokenNotifyUrls: {}
}

const keys = {
    private: fs.readFileSync('../keys/bank_privkey.pem'),
    public: fs.readFileSync('../keys/bank_pubkey.pem')
}

/**
 * Get the protocol's internal state
 * @returns {Object} The state
 */
function getProtocolState() {
    return protocolState
}

/**
 * Get the set of user keys
 * @returns {Object} The used keys. Contains: `private`, `public`, `bankPublic`
 */
function getKeys() {
    return keys
}

/**
 * Returns the tranaction object with the given ID. The object is removed from the queue
 * @param {string} id - The transaction's ID
 * @returns {Object} The tranaction object
 */
function popOngoingTransaction(id) {
    const transaction = protocolState.ongoing.transactions[id]
    delete protocolState.ongoing.transactions[id]
    return transaction
}

/**
 * Returns the challenge with the given ID. The challenge is removed from the queue
 * @param {string} id - The transaction ID associated with the challenge
 * @returns {string} The challenge as a base64 string
 */
function popOngoingChallenge(id) {
    const challenge = protocolState.ongoing.challenges[id]
    delete protocolState.ongoing.challenges[id]
    return challenge
}

/**
 * Returns the modification data with the given ID. The modification data is removed from the queue
 * @param {string} id - The transaction ID associated with the modification data
 * @returns {Object} The modification data
 */
function popOngoingModification(id) {
    const modifIndex = protocolState.ongoing.modifications.findIndex((elem) => elem.id == id )
    const modification = protocolState.ongoing.modifications[modifIndex]
    protocolState.ongoing.modifications.splice(modifIndex, 1)
    return modification
}

/**
 * Returns a list of all STP tokens
 * @returns {Object[]} The STP token
 */
function getAllTokensList() {
    return Object.values(protocolState.tokens)
}

/**
 * Returns the token with the given ID
 * @param {string} id - The transaction ID associated with the token
 * @returns {Object} The STP token
 */
function getToken(id) {
    return protocolState.tokens[id]
}

export default {
    getProtocolState, getKeys, popOngoingTransaction, popOngoingChallenge, popOngoingModification,
    getAllTokensList, getToken
}
