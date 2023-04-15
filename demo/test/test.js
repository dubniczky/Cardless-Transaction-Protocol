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
