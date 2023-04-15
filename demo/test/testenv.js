import browser from './browser.js'
import child_process from 'child_process'

/**
 * Creates test case and grants safe test environment (running servers, closing browser and servers in case of error)
 * @param {string} description - Passed to mocha's `it` function
 * @param {} func - The test function. Syntax: `async function (vendorTab, providerTab)`
 */
export function test(description, func) {
    it(description, async function () {
        const vendorServer = await child_process.spawn('node', ['--no-warnings', 'server.js'], { cwd: '../vendor'})
        const providerServer = await child_process.spawn('node', ['--no-warnings', 'server.js'], { cwd: '../provider'})
        vendorServer.stderr.on('data', (data) => {
            console.error(`vendorServer: ${data}`);
        })
        providerServer.stderr.on('data', (data) => {
            console.error(`providerServer: ${data}`);
        })

        const [ vendorTab, providerTab ] = await browser.openTabs()
        try {
            await func(vendorTab, providerTab)
        } finally {
            await browser.close()
            await vendorServer.kill()
            await providerServer.kill()
        }
    })
}
