export function createToolLimitNode(maxToolRounds: number) {
  return async () => {
    throw new Error(`工具呼叫超過最大迭代次數（${maxToolRounds}）`)
  }
}
