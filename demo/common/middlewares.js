const getDurationInMilliseconds = (start) => {
    const NS_PER_SEC = 1e9
    const NS_TO_MS = 1e6
    const diff = process.hrtime(start)

    return (diff[0] * NS_PER_SEC + diff[1]) / NS_TO_MS
}


function benchmark() {
    return async (req, res, next) => {
        const start = process.hrtime()

        res.on('finish', () => {            
            const durationInMilliseconds = getDurationInMilliseconds (start)
            console.log(`BENCHMARK ${req.method} ${req.originalUrl}: ${durationInMilliseconds.toLocaleString()} ms`)
        })

        next()
    }
}

export default {
    benchmark
}