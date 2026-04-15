import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

let _client: PlaidApi | null = null

export function getPlaidClient(): PlaidApi {
  if (_client) return _client

  const env = process.env.PLAID_ENV || 'sandbox'
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID || '',
        'PLAID-SECRET': process.env.PLAID_SECRET || '',
      },
    },
  })

  _client = new PlaidApi(configuration)
  return _client
}
