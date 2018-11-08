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

const getCurrentTime = () => Math.round(new Date().getTime() / 1000)

const calcStamina = (lastDrawedAt, lastStamina, capacity, currentTime) => {
  // 12 分で 1 スタミナが貯まる
  const basicIncome = Math.floor((currentTime - lastDrawedAt) / (12 * 60))

  // capacity を超えない分が現在の stamina
  const stamina = Math.min(basicIncome + lastStamina, capacity)

  // しかし減ることはない
  return Math.max(lastStamina, stamina)
}

const getProgressBar = (val, max) => {
  const chars = 60
  const filled = Math.round(Math.min(val, max) * chars / max)
  const empty = chars - filled
  return `[${'|'.repeat(filled)}${'.'.repeat(empty)}] ${val}/${max}`
}

const cost = onakaSettings.cost
const capacity = onakaSettings.capacity

const onakaPattern = (() => {
  const onaka = '(おなか|お腹|オナカ|ｵﾅｶ|:onaka:)'
  const suisui = '(すいすい|:suisui:)'
  const ippai = '(いっぱい|:ippai:)'
  const shout = '(ねえ|へい|ヘイ|オ[ッー]ケー|ok|okay)'

  return new RegExp(`(${onaka}\\s?((${suisui}|${ippai})\\s?)?[?？]|${shout}\\s?${onaka})`, 'i')
})()

module.exports = robot => {
  robot.respond(onakaPattern, res => {
    res.send([
      `"${res.match[1]}" is obsolete. Use "？"`,
      `"${res.match[1]}" は廃止されました。 "？" をご使用ください。`
    ].join('\n'))
  })

  robot.respond(/((すいすい|いっぱい|おなか)?[？?])/, res => {
    const currentTime = getCurrentTime()

    // ユーザ情報の引き出し
    const currentUserKey = `user:${res.message.user.id}`
    const currentUser = robot.brain.get(currentUserKey) || { lastDrawedAt: 0, lastStamina: 0, collection: {} }

    // 現在のスタミナを計算
    const stamina = calcStamina(currentUser.lastDrawedAt, currentUser.lastStamina || 0, capacity, currentTime)

    if (stamina >= cost) {
      currentUser.lastStamina = stamina - cost

      const [rarity, status] = drawLottery()

      currentUser.collection[rarity] = currentUser.collection[rarity] || {}
      currentUser.collection[rarity][status] = (currentUser.collection[rarity][status] || 0) + 1

      currentUser.lastDrawedAt = currentTime

      robot.brain.set(currentUserKey, currentUser)

      res.send(`*[${rarity}]* ${status}`)
    } else {
      res.send([
        `:error: スタミナが足りません`,
        `スタミナ ${getProgressBar(stamina, capacity)}`,
        `(おなかうらないにはスタミナが${cost}必要です)`
      ].join('\n'))
    }
  })

  robot.respond(/(スタミナ|stamina)/, res => {
    const currentTime = getCurrentTime()

    // ユーザ情報の引き出し
    const currentUserKey = `user:${res.message.user.id}`
    const currentUser = robot.brain.get(currentUserKey) || { lastDrawedAt: 0, lastStamina: 0, collection: {} }

    // 現在のスタミナを計算
    const stamina = calcStamina(currentUser.lastDrawedAt, currentUser.lastStamina || 0, capacity, currentTime)

    res.send(getProgressBar(stamina, capacity))
  })

  robot.respond(/(コレクション|collection)/, res => {
    const currentUserKey = `user:${res.message.user.id}`
    const currentUser = robot.brain.get(currentUserKey)

    const result = Object.entries(currentUser.collection || {})
      .sort((a, b) => onakaSettings.onakaStatuses[a[0]].freq - onakaSettings.onakaStatuses[b[0]].freq)
      .map(([rarity, cols]) => [
        `*[${rarity}]* (${Object.keys(cols).length}/${onakaSettings.onakaStatuses[rarity].statuses.length})`,
        Object.entries(cols).map(([status, num]) => `- ${status} ...... ${num}回`).join('\n')
      ].join('\n')).join('\n\n')

    res.send(result)
  })

  robot.respond(/(チャレンジ|challenge)/, res => {
    const currentTime = getCurrentTime()

    // ユーザ情報の引き出し
    const currentUserKey = `user:${res.message.user.id}`
    const currentUser = robot.brain.get(currentUserKey) || { lastDrawedAt: 0, lastStamina: 0, collection: {} }

    // 現在のスタミナを計算
    const stamina = calcStamina(currentUser.lastDrawedAt, currentUser.lastStamina || 0, capacity, currentTime)

    if (stamina >= cost * 2 / 3) {
      (async () => {
        res.send(`チャレンジを開始します。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`現在、あなたのスタミナは${stamina}です。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`チャレンジでは、1/2 の確率でスタミナが倍になります。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`しかし、そうでない場合にはスタミナが 0 になります。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`もうキャンセルは許されません。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`あなたのスタミナは・・・`)
        await new Promise(resolve => setTimeout(resolve, 8000))

        if (Math.random() < 0.5) {
          currentUser.lastStamina = stamina * 2
          res.send([
            `${stamina * 2} になりました。`,
            `おめでとうございます！`
          ].join('\n'))
        } else {
          currentUser.lastStamina = 0
          res.send([
            `0 になりました。`,
            `残念でした。`
          ].join('\n'))
        }

        currentUser.lastDrawedAt = currentTime
        robot.brain.set(currentUserKey, currentUser)
      })()
    } else {
      res.send([
        `:error: スタミナが足りません`,
        `スタミナ ${getProgressBar(stamina, capacity)}`,
        `(チャレンジにはスタミナが${cost * 2 / 3}以上必要です)`
      ].join('\n'))
    }
  })

  robot.respond(/(ヘルプ|help)/, res => {
    res.send([
      `*@おなか ヘルプ*`,
      `*@おなか help*`,
      `    おなか bot の使い方を表示します。`,
      ``,
      `*@おなか ？*`,
      `    おなかうらないをします。`,
      `    1回15スタミナを消費します。`,
      ``,
      `*@おなか スタミナ*`,
      `*@おなか stamina*`,
      `    現在のスタミナを表示します。`,
      `    スタミナは12分に1回復します。`,
      ``,
      `*@おなか コレクション*`,
      `*@おなか collection*`,
      `    現在までに取得したおなかステータスのコレクションを表示します。`
    ].join('\n'))
  })
}
