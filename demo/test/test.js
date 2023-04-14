import { Builder, By, Key } from 'selenium-webdriver'
import assert from 'assert'


const driver = await new Builder().forBrowser('chrome').build()


async function openTabs() {
    await driver.get('http://localhost:3000/')

    await driver.switchTo().newWindow('tab')
    await driver.get('http://localhost:8000/')

    const windowHandles = await driver.getAllWindowHandles()
    return windowHandles
}


async function startVendorTransaction(vendorTab, amount, currency) {
    await driver.switchTo().window(vendorTab)
    await driver.findElement(By.id('amount')).sendKeys(amount)
    await driver.findElement(By.id('currency')).sendKeys(currency, Key.RETURN)

    return await driver.findElement(By.xpath('//p/b[contains(text(), "stp://")]')).getText()
}


async function getPinFromVendor(vendorTab) {
    await driver.switchTo().window(vendorTab)
    let pin = await driver.findElement(By.id('pin')).getText()
    while (pin === '...') {
        await new Promise(r => setTimeout(r, 100))
        pin = await driver.findElement(By.id('pin')).getText()
    }
    return pin
}


async function tokenNegotiation() {
    const [ vendorTab, providerTab ] = await openTabs()

    const stpUrl = await startVendorTransaction(vendorTab, 1, 'USD')

    await driver.switchTo().window(providerTab)
    await driver.findElement(By.id('url')).sendKeys(stpUrl, Key.RETURN)

    const pin = await getPinFromVendor(vendorTab)

    await driver.switchTo().window(providerTab)
    await driver.findElement(By.id('pin')).sendKeys(pin, Key.RETURN)

    const tokenAtProvider = await driver.findElement(By.xpath('//pre')).getText()
    const transactionId = JSON.parse(tokenAtProvider).transaction.id

    await driver.switchTo().window(vendorTab)
    await driver.findElement(By.xpath('//a[@href="/"]')).click()
    await driver.findElement(By.xpath(`//a[@href="/token/${transactionId}"]`)).click()
    const tokenAtVendor = await driver.findElement(By.xpath('//pre')).getText()

    assert.equal(tokenAtProvider, tokenAtVendor)

    await driver.quit()
}


tokenNegotiation()
