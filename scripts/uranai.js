// Description:
//  おなかうらない。

const onakaSettings = require('../onaka_settings.json')

const drawLottery = (() => {
  const onakaStatuses = Object.entries(onakaSettings.onakaStatuses)

  return () => {
    // 乱数生成 (1 〜 出現頻度の合計値)
    const roll = (() => {
      let nPattern = 0
      onakaStatuses.forEach(([_, values]) => {
        nPattern += values.freq * values.statuses.length
      })
      return Math.floor(Math.random() * nPattern) + 1
    })()

    // 生成した乱数に対応するお腹状態を返す
    let sum = 0
    let result
    onakaStatuses.forEach(([rarity, values]) => {
      const freq = values.freq
      const statuses = values.statuses

      statuses.forEach(status => {
        sum += freq
        if (result === undefined && roll <= sum) {
          result = [rarity, status]
        }
      })
    })
    return result
  }
})()

const onakaPattern = (() => {
  const onaka = '(おなか|お腹|オナカ|ｵﾅｶ|:onaka:)'
  const suisui = '(すいすい|:suisui:)'
  const ippai = '(いっぱい|:ippai:)'
  const shout = '(ねえ|へい|ヘイ|オ[ッー]ケー|ok|okay)'

  return new RegExp(`(${onaka}\\s?((${suisui}|${ippai})\\s?)?[?？]|${shout}\\s?${onaka})`, 'i')
})()

const interval = onakaSettings.interval

module.exports = robot => {
  robot.respond(onakaPattern, res => {
    const currentTime = Math.round(new Date().getTime() / 1000)
    const currentUserKey = `user:${res.message.user.id}`
    const currentUser = robot.brain.get(currentUserKey) || { lastDrawedAt: -Infinity, collection: {} }
    const elapsedTime = currentTime - currentUser.lastDrawedAt

    if (elapsedTime >= interval) {
      // 前回の実行から interval 秒以上経過している場合
      const [rarity, status] = drawLottery()

      currentUser.collection[rarity] = currentUser.collection[rarity] || {}
      currentUser.collection[rarity][status] = (currentUser.collection[rarity][status] || 0) + 1
      currentUser.lastDrawedAt = currentTime
      robot.brain.set(currentUserKey, currentUser)

      res.send(`*[${rarity}]* ${status}`)
    } else {
      // 前回の実行から interval 秒以上経過していない場合
      res.send(`:error: しつこい！！ :mitazo: :mitazo: :mitazo:\n(あと${(interval - elapsedTime)}秒待ってね)`)
    }
  })

  robot.respond(/コレクション/, res => {
    const currentUserKey = `user:${res.message.user.id}`
    const currentUser = robot.brain.get(currentUserKey)

    const result = Object.entries(currentUser.collection || {})
      .sort((a, b) => onakaSettings.onakaStatuses[a[0]].freq - onakaSettings.onakaStatuses[b[0]].freq)
      .map(([rarity, cols]) => [
        `*[${rarity}]*`,
        Object.entries(cols).map(([status, num]) => `- ${status} ...... ${num}回`).join('\n')
      ].join('\n')).join('\n')

    res.send(result)
  })
}
