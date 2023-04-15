import { Builder, By, Key } from 'selenium-webdriver'


let driver = null


async function openTabs() {
    driver = await new Builder().forBrowser('chrome').build()
    await driver.get('http://localhost:3000/')

    await driver.switchTo().newWindow('tab')
    await driver.get('http://localhost:8000/')

    const windowHandles = await driver.getAllWindowHandles()
    return windowHandles
}


async function close() {
    await driver.quit()
    driver = null
}


async function startVendorTransaction(vendorTab, amount, currency, recurring = 'one_time') {
    await driver.switchTo().window(vendorTab)
    await driver.findElement(By.id('amount')).sendKeys(amount)
    await driver.findElement(By.id('recurring')).click()
    await driver.findElement(By.id('recurring')).findElement(By.css(`option[value="${recurring}"]`)).click()
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


async function startProviderTransaction(providerTab, stpUrl) {
    await driver.switchTo().window(providerTab)
    await driver.findElement(By.id('url')).sendKeys(stpUrl, Key.RETURN)
}


async function acceptTransaction(providerTab, pin) {
    await driver.switchTo().window(providerTab)
    await driver.findElement(By.id('pin')).sendKeys(pin, Key.RETURN)
}


async function backToMainPage(tab) {
    await driver.switchTo().window(tab)
    await driver.findElement(By.xpath('//a[@href="/"]')).click()
}


async function getDisplayedToken(tab) {
    await driver.switchTo().window(tab)
    return await driver.findElement(By.xpath('//pre')).getText()
}


async function startTokenAction(tab, transactionId, action) {
    await driver.switchTo().window(tab)
    await driver.findElement(By.xpath(`//a[contains(@href, "${transactionId}") and contains(text(), "${action}")]`)).click()
}


async function negotiateToken(vendorTab, providerTab, amount, currency, recurring = 'one_time') {
    const stpUrl = await startVendorTransaction(vendorTab, amount, currency, recurring)
    await startProviderTransaction(providerTab, stpUrl)

    const pin = await getPinFromVendor(vendorTab)
    await acceptTransaction(providerTab, pin)

    const tokenAtProvider = await getDisplayedToken(providerTab)
    const transactionId = JSON.parse(tokenAtProvider).transaction.id

    await backToMainPage(providerTab)
    await backToMainPage(vendorTab)

    return transactionId
}

export default {
    openTabs, close,
    startVendorTransaction, getPinFromVendor, startProviderTransaction, acceptTransaction, backToMainPage, getDisplayedToken,
    startTokenAction,
    negotiateToken
}
