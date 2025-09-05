export type Token = {
  name: string
  address: string
  chainId: number
  symbol: string
  decimals: number
  logoURI: string
}

export type DenyToken = {
  chainId: number
  address: string
  reason?: string
}

export type ApprovalResetToken = {
  address: string
  chainId: number
  note?: string
}
