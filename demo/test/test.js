import assert from 'assert'
import browser from './browser.js'
import { test } from './testenv.js'


describe('Token negotiation', function () {
    test('Non-recurring token', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD')

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const tokenAtVendor = await browser.getDisplayedToken(vendorTab)

        await browser.startTokenAction(providerTab, transactionId, 'Show')
        const tokenAtProvider = await browser.getDisplayedToken(providerTab)

        assert.equal(tokenAtProvider, tokenAtVendor)
        assert.equal(JSON.parse(tokenAtProvider).transaction.recurring, null)
    })

    test('Recurring token', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD', 'monthly')

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const tokenAtVendor = await browser.getDisplayedToken(vendorTab)

        await browser.startTokenAction(providerTab, transactionId, 'Show')
        const tokenAtProvider = await browser.getDisplayedToken(providerTab)

        assert.equal(tokenAtProvider, tokenAtVendor)
        assert.notEqual(JSON.parse(tokenAtProvider).transaction.recurring, null)
    })
})

describe('Token revocation', function () {
    test('Revocation by vendor', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD')
        
        const vendorTokensBefore = await browser.getListOfTokens(vendorTab)
        const providerTokensBefore = await browser.getListOfTokens(providerTab)

        assert.equal(vendorTokensBefore.length, 1)
        assert.equal(vendorTokensBefore[0], transactionId)
        assert.equal(providerTokensBefore.length, 1)
        assert.equal(providerTokensBefore[0], transactionId)

        await browser.startTokenAction(vendorTab, transactionId, 'Revoke')

        const vendorTokensAfter = await browser.getListOfTokens(vendorTab)
        const providerTokensAfter = await browser.getListOfTokens(providerTab)
        
        assert.equal(vendorTokensAfter.length, 0)
        assert.equal(providerTokensAfter.length, 0)
    })

    test('Revocation by provider', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD')
        
        const vendorTokensBefore = await browser.getListOfTokens(vendorTab)
        const providerTokensBefore = await browser.getListOfTokens(providerTab)

        assert.equal(vendorTokensBefore.length, 1)
        assert.equal(vendorTokensBefore[0], transactionId)
        assert.equal(providerTokensBefore.length, 1)
        assert.equal(providerTokensBefore[0], transactionId)

        await browser.startTokenAction(providerTab, transactionId, 'Revoke')

        const vendorTokensAfter = await browser.getListOfTokens(vendorTab)
        const providerTokensAfter = await browser.getListOfTokens(providerTab)
        
        assert.equal(vendorTokensAfter.length, 0)
        assert.equal(providerTokensAfter.length, 0)
    })
})

describe('Token refreshing', function () {
    test('Single refresh', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD', 'quarterly')
        
        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const vendorTokenBefore = JSON.parse(await browser.getDisplayedToken(vendorTab))
        await browser.backToMainPage(vendorTab)

        assert.equal(vendorTokenBefore.transaction.recurring?.index, 0)

        await browser.startTokenAction(vendorTab, transactionId, 'Refresh')

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const vendorTokenAfter = JSON.parse(await browser.getDisplayedToken(vendorTab))

        assert.equal(vendorTokenAfter.transaction.recurring?.index, 1)

        await browser.startTokenAction(providerTab, transactionId, 'Show')
        const providerTokenAfter = JSON.parse(await browser.getDisplayedToken(providerTab))

        assert.deepEqual(vendorTokenAfter, providerTokenAfter)
    })
})

describe('Token modification', function () {
    test('Instant accept', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD')

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const vendorTokenBefore = JSON.parse(await browser.getDisplayedToken(vendorTab))
        await browser.backToMainPage(vendorTab)

        assert.equal(vendorTokenBefore.transaction.amount, 1)
        assert.equal(vendorTokenBefore.transaction.currency, 'USD')

        await browser.startTokenAction(vendorTab, transactionId, 'Modify')
        await browser.startModificationRequest(vendorTab, 2, 'EUR')

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const vendorTokenAfter = JSON.parse(await browser.getDisplayedToken(vendorTab))
        await browser.startTokenAction(providerTab, transactionId, 'Show')
        const providerTokenAfter = JSON.parse(await browser.getDisplayedToken(providerTab))

        assert.deepEqual(vendorTokenAfter, providerTokenAfter)
        assert.equal(vendorTokenAfter.transaction.amount, 2)
        assert.equal(vendorTokenAfter.transaction.currency, 'EUR')
    })

    test('Delayed accept', async function (vendorTab, providerTab) {
        const transactionId = await browser.negotiateToken(vendorTab, providerTab, 1, 'USD')

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const vendorTokenBefore = JSON.parse(await browser.getDisplayedToken(vendorTab))
        await browser.backToMainPage(vendorTab)

        assert.equal(vendorTokenBefore.transaction.amount, 1)
        assert.equal(vendorTokenBefore.transaction.currency, 'USD')

        await browser.toggleInstantAccept(providerTab)
        await browser.startTokenAction(vendorTab, transactionId, 'Modify')
        await browser.startModificationRequest(vendorTab, 2, 'EUR')
        await browser.acceptConfirmAlert(providerTab)

        await browser.startTokenAction(vendorTab, transactionId, 'Show')
        const vendorTokenAfter = JSON.parse(await browser.getDisplayedToken(vendorTab))
        await browser.startTokenAction(providerTab, transactionId, 'Show')
        const providerTokenAfter = JSON.parse(await browser.getDisplayedToken(providerTab))

        assert.deepEqual(vendorTokenAfter, providerTokenAfter)
        assert.equal(vendorTokenAfter.transaction.amount, 2)
        assert.equal(vendorTokenAfter.transaction.currency, 'EUR')
    })
})
