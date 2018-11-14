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

const getProgressBar = (val, max) => {
  const chars = 60
  const filled = Math.round(Math.min(val, max) * chars / max)
  const empty = chars - filled
  return `[${'|'.repeat(filled)}${'.'.repeat(empty)}] ${val}/${max}`
}

const cost = onakaSettings.cost
const defaultCapacity = onakaSettings.defaultCapacity

module.exports = robot => {
  class User {
    constructor (userId) {
      this.userKey = `user:${userId}`

      const userObject = robot.brain.get(this.userKey) || {}
      this.lastDrawedAt = userObject.lastDrawedAt || 0
      this.lastStamina = userObject.lastStamina || 0
      this.capacity = userObject.capacity || defaultCapacity
      this.collection = userObject.collection || {}
    }

    save () {
      robot.brain.set(this.userKey, {
        lastDrawedAt: this.lastDrawedAt,
        lastStamina: this.lastStamina,
        capacity: this.capacity,
        collection: this.collection
      })
    }

    stamina (currentTime) {
      // 12 分で 1 スタミナが貯まる
      const basicIncome = Math.floor((currentTime - this.userObject.lastDrawedAt) / (12 * 60))

      // capacity を超えない分が現在の stamina
      const stamina = Math.min(basicIncome + this.userObject.lastStamina, this.userObject.capacity)

      // しかし減ることはない
      return Math.max(this.userObject.lastStamina, stamina)
    }

    // スタミナを増減させる
    // softInc: 0〜capacityの間の増減分
    // hardInc: 制限なしの増減分
    increaseStamina (currentTime, softInc = 0, hardInc = 0) {
      this.lastStamina = Math.max(Math.min(this.stamina(currentTime) + softInc, this.capacity), 0) + hardInc
      this.lastDrawedAt = currentTime
    }

    addOnakaStatus (rarity, status) {
      this.collection[rarity] = this.collection[rarity] || {}
      this.collection[rarity][status] = (this.collection[rarity][status] || 0) + 1
    }
  }

  robot.respond(/((すいすい|いっぱい|おなか)?[？?])/, res => {
    const currentTime = getCurrentTime()
    const currentUser = new User(res.message.user.id)
    const currentStamina = currentUser.stamina(currentTime)

    if (currentUser.stamina(currentTime) >= cost) {
      currentUser.increaseStamina(currentTime, -cost)
      const [rarity, status] = drawLottery()
      currentUser.addOnakaStatus(rarity, status)
      currentUser.save()

      res.send(`*[${rarity}]* ${status}${currentUser.collection[rarity][status] === 1 ? '      :new:' : ''}`)
    } else {
      res.send([
        `:error: スタミナが足りません`,
        `スタミナ ${getProgressBar(currentStamina, currentUser.capacity)}`,
        `(おなかうらないにはスタミナが${cost}必要です)`
      ].join('\n'))
    }
  })

  robot.respond(/(スタミナ|stamina)/, res => {
    const currentTime = getCurrentTime()
    const currentUser = new User(res.message.user.id)
    const currentStamina = currentUser.stamina(currentTime)

    res.send(getProgressBar(currentStamina, currentUser.capacity))
  })

  robot.respond(/(コレクション|collection)/, res => {
    const currentUser = new User(res.message.user.id)

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
    const currentUser = new User(res.message.user.id)
    const currentStamina = currentUser.stamina(currentTime)

    if (currentStamina >= cost * 2 / 3) {
      let result = null
      if (Math.random() < 0.5) {
        currentUser.increaseStamina(currentTime, 0, currentStamina)
        result = [
          `${currentStamina * 2} になりました。`,
          `おめでとうございます！`
        ].join('\n')
      } else {
        currentUser.increaseStamina(currentTime, 0, -currentStamina)
        result = [
          `0 になりました。`,
          `残念でした。`
        ].join('\n')
      }

      currentUser.save();

      (async () => {
        res.send(`チャレンジを開始します。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`現在、あなたのスタミナは${currentStamina}です。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`チャレンジでは、1/2 の確率でスタミナが倍になります。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`しかし、そうでない場合にはスタミナが 0 になります。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`もうキャンセルは許されません。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`あなたのスタミナは・・・`)
        await new Promise(resolve => setTimeout(resolve, 8000))
        res.send(result)
      })()
    } else {
      res.send([
        `:error: スタミナが足りません`,
        `スタミナ ${getProgressBar(currentStamina, currentUser.capacity)}`,
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
      `*@おなか チャレンジ*`,
      `*@おなか challenge*`,
      `    非推奨機能です。`,
      ``,
      `*@おなか コレクション*`,
      `*@おなか collection*`,
      `    現在までに取得したおなかステータスのコレクションを表示します。`
    ].join('\n'))
  })
}
