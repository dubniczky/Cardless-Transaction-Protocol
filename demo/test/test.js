import assert from 'assert'
import browser from './browser.js'
import { test } from './testenv.js'
import utils from '../common/utils.js'


describe('Token negotiation', function () {
    test('Non-recurring token', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD')

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const tokenAtVendor = await browser.getDisplayedToken(vendorTab)

        await browser.startTokenAction(providerTab, transactionId, 'Show')
        const tokenAtProvider = await browser.getDisplayedToken(providerTab)

        assert.deepEqual(tokenAtProvider, tokenAtVendor)
        assert.equal(tokenAtProvider.transaction.amount, 1)
        assert.equal(tokenAtProvider.transaction.currency, 'USD')
        assert.equal(tokenAtProvider.transaction.recurring, null)
        assert.ok(utils.verifyVendorSignatureOfToken(tokenAtProvider))
        assert.ok(utils.verifyProviderSignatureOfToken(tokenAtProvider))
    })

    test('Recurring token', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD', 'monthly')

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const tokenAtVendor = await browser.getDisplayedToken(vendorTab)

        await browser.startTokenAction(providerTab, transactionId, 'Show')
        const tokenAtProvider = await browser.getDisplayedToken(providerTab)

        assert.deepEqual(tokenAtProvider, tokenAtVendor)
        assert.equal(tokenAtProvider.transaction.amount, 1)
        assert.equal(tokenAtProvider.transaction.currency, 'USD')
        assert.notEqual(tokenAtProvider.transaction.recurring, null)
        assert.equal(tokenAtProvider.transaction.recurring.period, 'monthly')
        assert.equal(tokenAtProvider.transaction.recurring.index, 0)
        assert.ok(utils.verifyVendorSignatureOfToken(tokenAtProvider))
        assert.ok(utils.verifyProviderSignatureOfToken(tokenAtProvider))
    })
})

describe('Token revocation', function () {
    test('Revocation by vendor', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD')
        
        const vendorTokensBefore = await browser.getListOfTokens(vendorTab)
        const providerTokensBefore = await browser.getListOfTokens(providerTab)

        await browser.startTokenAction(vendorTab, transactionId, 'Revoke')

        const vendorTokensAfter = await browser.getListOfTokens(vendorTab)
        const providerTokensAfter = await browser.getListOfTokens(providerTab)
        
        assert.deepEqual(vendorTokensBefore, [transactionId])
        assert.deepEqual(providerTokensBefore, [transactionId])
        assert.deepEqual(vendorTokensAfter, [])
        assert.deepEqual(providerTokensAfter, [])
    })

    test('Revocation by provider', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD')
        
        const vendorTokensBefore = await browser.getListOfTokens(vendorTab)
        const providerTokensBefore = await browser.getListOfTokens(providerTab)

        await browser.startTokenAction(providerTab, transactionId, 'Revoke')

        const vendorTokensAfter = await browser.getListOfTokens(vendorTab)
        const providerTokensAfter = await browser.getListOfTokens(providerTab)
        
        assert.deepEqual(vendorTokensBefore, [transactionId])
        assert.deepEqual(providerTokensBefore, [transactionId])
        assert.deepEqual(vendorTokensAfter, [])
        assert.deepEqual(providerTokensAfter, [])
    })
})

describe('Token refreshing', function () {
    test('Single refresh', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD', 'quarterly')
        
        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const vendorTokenBefore = await browser.getDisplayedToken(vendorTab)
        await browser.backToMainPage(vendorTab)


        await browser.startTokenAction(vendorTab, transactionId, 'Refresh')

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const vendorTokenAfter = await browser.getDisplayedToken(vendorTab)


        await browser.startTokenAction(providerTab, transactionId, 'Show')
        const providerTokenAfter = await browser.getDisplayedToken(providerTab)

        assert.equal(vendorTokenBefore.transaction.amount, 1)
        assert.equal(vendorTokenBefore.transaction.currency, 'USD')
        assert.notEqual(vendorTokenBefore.transaction.recurring, null)
        assert.equal(vendorTokenBefore.transaction.recurring.period, 'quarterly')
        assert.equal(vendorTokenBefore.transaction.recurring.index, 0)
        
        assert.equal(vendorTokenAfter.transaction.amount, 1)
        assert.equal(vendorTokenAfter.transaction.currency, 'USD')
        assert.notEqual(vendorTokenAfter.transaction.recurring, null)
        assert.equal(vendorTokenAfter.transaction.recurring.period, 'quarterly')
        assert.equal(vendorTokenAfter.transaction.recurring.index, 1)
        assert.ok(utils.verifyVendorSignatureOfToken(vendorTokenAfter))
        assert.ok(utils.verifyProviderSignatureOfToken(vendorTokenAfter))

        assert.deepEqual(vendorTokenAfter, providerTokenAfter)
    })
})

describe('Token modification', function () {
    test('Instant accept', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD')

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const vendorTokenBefore = await browser.getDisplayedToken(vendorTab)
        await browser.backToMainPage(vendorTab)

        await browser.startTokenAction(vendorTab, transactionId, 'Modify')
        await browser.startModificationRequest(vendorTab, 2, 'EUR')

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const vendorTokenAfter = await browser.getDisplayedToken(vendorTab)
        await browser.startTokenAction(providerTab, transactionId, 'Show')
        const providerTokenAfter = await browser.getDisplayedToken(providerTab)

        assert.equal(vendorTokenBefore.transaction.amount, 1)
        assert.equal(vendorTokenBefore.transaction.currency, 'USD')
        assert.equal(vendorTokenBefore.transaction.recurring, null)

        assert.equal(vendorTokenAfter.transaction.amount, 2)
        assert.equal(vendorTokenAfter.transaction.currency, 'EUR')
        assert.equal(vendorTokenAfter.transaction.recurring, null)
        assert.ok(utils.verifyVendorSignatureOfToken(vendorTokenAfter))
        assert.ok(utils.verifyProviderSignatureOfToken(vendorTokenAfter))

        assert.deepEqual(vendorTokenAfter, providerTokenAfter)
    })

    test('Delayed accept', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD')

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const vendorTokenBefore = await browser.getDisplayedToken(vendorTab)
        await browser.backToMainPage(vendorTab)

        await browser.toggleInstantAccept(providerTab)
        await browser.startTokenAction(vendorTab, transactionId, 'Modify')
        await browser.startModificationRequest(vendorTab, 2, 'EUR')
        await browser.acceptConfirmAlert(providerTab)

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const vendorTokenAfter = await browser.getDisplayedToken(vendorTab)
        await browser.startTokenAction(providerTab, transactionId, 'Show')
        const providerTokenAfter = await browser.getDisplayedToken(providerTab)

        assert.equal(vendorTokenBefore.transaction.amount, 1)
        assert.equal(vendorTokenBefore.transaction.currency, 'USD')
        assert.equal(vendorTokenBefore.transaction.recurring, null)

        assert.equal(vendorTokenAfter.transaction.amount, 2)
        assert.equal(vendorTokenAfter.transaction.currency, 'EUR')
        assert.equal(vendorTokenAfter.transaction.recurring, null)
        assert.ok(utils.verifyVendorSignatureOfToken(vendorTokenAfter))
        assert.ok(utils.verifyProviderSignatureOfToken(vendorTokenAfter))

        assert.deepEqual(vendorTokenAfter, providerTokenAfter)
    })
})
