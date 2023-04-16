import { Builder, By, Key, until } from 'selenium-webdriver'
import utils from '../common/utils.js'


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


async function clearInput(inputElem) {
    await driver.executeScript(elem => elem.select(), inputElem);
    await inputElem.sendKeys(Key.BACK_SPACE);
}


async function selectOption(select, optionValue) {
    await select.click()
    await select.findElement(By.css(`option[value="${optionValue}"]`)).click()
}


async function startVendorTransaction(vendorTab, amount, currency, recurring = 'one_time') {
    await driver.switchTo().window(vendorTab)
    await driver.findElement(By.id('amount')).sendKeys(amount)
    await selectOption(await driver.findElement(By.id('recurring')), recurring)
    await driver.findElement(By.id('currency')).sendKeys(currency, Key.RETURN)

    return await driver.findElement(By.xpath('//p/b[contains(text(), "stp://")]')).getText()
}


async function getPinFromVendor(vendorTab) {
    await driver.switchTo().window(vendorTab)
    let pin = await driver.findElement(By.id('pin')).getText()
    while (pin === '...') {
        await utils.sleep(100)
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
    const tokenStr = await driver.findElement(By.xpath('//pre')).getText()
    return await JSON.parse(tokenStr)
}


async function startTokenAction(tab, transactionId, action) {
    await driver.switchTo().window(tab)
    await driver.navigate().refresh()
    await driver.findElement(By.xpath(`//a[contains(@href, "${transactionId}") and contains(text(), "${action}")]`)).click()
}


async function getListOfTokens(tab) {
    await driver.switchTo().window(tab)
    await driver.navigate().refresh()
    const listElems = await driver.findElement(By.id('tokens')).findElements(By.xpath('//li'))
    const tokens = []
    for (const listElem of listElems) {
        tokens.push(await listElem.findElement(By.xpath('//b')).getText())
    }
    return tokens
}


async function startModificationRequest(vendorTab, amount, currency, recurring = 'one_time') {
    await driver.switchTo().window(vendorTab)
    await clearInput(await driver.findElement(By.id('amount')))
    await clearInput(await driver.findElement(By.id('currency')))

    await driver.findElement(By.id('amount')).sendKeys(amount)
    await selectOption(await driver.findElement(By.id('recurring')), recurring)
    await driver.findElement(By.id('currency')).sendKeys(currency, Key.RETURN)
}


async function toggleInstantAccept(providerTab) {
    await driver.switchTo().window(providerTab)
    await driver.findElement(By.id('accept_modify')).click()
}


async function acceptConfirmAlert(providerTab) {
    await driver.switchTo().window(providerTab)
    await driver.navigate().refresh()
    await driver.wait(until.alertIsPresent())
    const alert = await driver.switchTo().alert()
    await alert.accept()
}


async function negotiateToken(vendorTab, providerTab, amount, currency, recurring = 'one_time') {
    const stpUrl = await startVendorTransaction(vendorTab, amount, currency, recurring)
    await startProviderTransaction(providerTab, stpUrl)

    const pin = await getPinFromVendor(vendorTab)
    await acceptTransaction(providerTab, pin)

    const tokenAtProvider = await getDisplayedToken(providerTab)

    await backToMainPage(providerTab)
    await backToMainPage(vendorTab)

    return tokenAtProvider.transaction.id
}

export default {
    openTabs, close,
    startVendorTransaction, getPinFromVendor, startProviderTransaction, acceptTransaction, backToMainPage, getDisplayedToken,
    startTokenAction, getListOfTokens, startModificationRequest, toggleInstantAccept, acceptConfirmAlert,
    negotiateToken
}
