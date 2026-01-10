import { EventEmitter } from 'node:events'
import dotenv from 'dotenv'

dotenv.config({ path: './test.env' })

EventEmitter.defaultMaxListeners = 20
