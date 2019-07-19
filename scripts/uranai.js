// Description:
//  おなかうらない。

const onakaSettings = require('../onaka_settings.json')

const onakaStatuses = onakaSettings.onakaStatuses
const cost = onakaSettings.cost
const dryRunCost = onakaSettings.dryRunCost
const defaultCapacity = onakaSettings.defaultCapacity

const drawLottery = () => {
  // 乱数生成 (1 〜 出現頻度の合計値)
  const roll = (() => {
    let nPattern = 0
    Object.entries(onakaStatuses).forEach(([_, values]) => {
      nPattern += values.freq * values.statuses.length
    })
    return Math.floor(Math.random() * nPattern) + 1
  })()

  // 生成した乱数に対応するお腹状態を返す
  let sum = 0
  let result
  Object.entries(onakaStatuses).forEach(([rarity, values]) => {
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

const getProgressBar = (val, max) => {
  const chars = 60
  const filled = Math.round(Math.min(val, max) * chars / max)
  const empty = chars - filled
  return `[${'|'.repeat(filled)}${'.'.repeat(empty)}] ${val}/${max}`
}

module.exports = robot => {
  class User {
    constructor (userId) {
      this.userKey = `user:${userId}`

      const userObject = robot.brain.get(this.userKey) || {}
      this.userId = userObject.userId || userId
      this.lastDrawedAt = userObject.lastDrawedAt || 0
      this.lastStamina = userObject.lastStamina || 0
      this.capacity = userObject.capacity || defaultCapacity
      this.collection = userObject.collection || {}

      this.currentTime = Math.round(new Date().getTime() / 1000)
    }

    save () {
      robot.brain.set(this.userKey, {
        userId: this.userId,
        lastDrawedAt: this.lastDrawedAt,
        lastStamina: this.lastStamina,
        capacity: this.capacity,
        collection: this.collection
      })

      const ranking = new Ranking()
      ranking.update(this.userId, this.score())
    }

    stamina () {
      // 12 分で 1 スタミナが貯まる
      const basicIncome = Math.floor((this.currentTime - this.lastDrawedAt) / (12 * 60))

      // capacity を超えない分が現在の stamina
      const stamina = Math.min(basicIncome + this.lastStamina, this.capacity)

      // しかし減ることはない
      return Math.max(this.lastStamina, stamina)
    }

    score () {
      return Math.floor(Object.entries(this.collection).map(([rarity, statuses]) => {
        const count = Object.entries(statuses).map(([_, cnt]) => cnt).reduce((a, b) => a + b)
        const unitScore = 1024 / onakaStatuses[rarity].freq

        return count * unitScore
      }).reduce((a, b) => a + b))
    }

    // スタミナを増減させる
    // softInc: 0〜capacityの間の増減分
    // hardInc: 制限なしの増減分
    increaseStamina (softInc = 0, hardInc = 0) {
      this.lastStamina = Math.max(Math.min(this.stamina(this.currentTime) + softInc, this.capacity), 0) + hardInc
      this.lastDrawedAt = this.currentTime
    }

    addOnakaStatus (rarity, status) {
      this.collection[rarity] = this.collection[rarity] || {}
      this.collection[rarity][status] = (this.collection[rarity][status] || 0) + 1
    }
  }

  class Ranking {
    constructor () {
      this.ranking = robot.brain.get('ranking') || {}
    }

    update (userId, score) {
      this.ranking[userId] = score
      robot.brain.set('ranking', this.ranking)
    }

    getRank (userId) {
      const score = this.ranking[userId]

      if (score === undefined) {
        const currentUser = new User(userId)
        this.update(userId, currentUser.score())
        return this.getRank(userId)
      }

      let rank = 1
      Object.entries(this.ranking).forEach(([_, otherScore]) => {
        if (score < otherScore) {
          rank += 1
        }
      })
      return rank
    }

    numberOfParticipants () {
      return Object.entries(this.ranking).length
    }
  }

  robot.respond(/([？?]+)$/, res => {
    const times = res.match[1].length
    const currentUser = new User(res.message.user.id)

    if (currentUser.stamina() >= cost * times) {
      currentUser.increaseStamina(-cost * times)

      // draw and save
      let statuses = []
      for (let i = times; i > 0; --i) {
        const [rarity, status] = drawLottery()
        currentUser.addOnakaStatus(rarity, status)
        statuses.push([rarity, status, currentUser.collection[rarity][status] === 1])
      }
      currentUser.save();

      (async () => {
        for (let [rarity, status, isNew] of statuses) {
          res.send(`*[${rarity}]* ${status}${isNew ? '      :new:' : ''}`)
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      })()
    } else {
      res.send([
        `:error: スタミナが足りません`,
        `スタミナ ${getProgressBar(currentUser.stamina(), currentUser.capacity)}`,
        `(おなかうらないを${times}回するにはスタミナが${cost * times}必要です)`
      ].join('\n'))
    }
  })

  robot.respond(/(お試し|dry-?run|dry)$/, res => {
    const currentUser = new User(res.message.user.id)

    if (currentUser.stamina() >= dryRunCost) {
      // draw, but don't save
      const [rarity, status] = drawLottery()
      res.send(`*[${rarity}]* ${status}      *(お試し)*`)
      currentUser.increaseStamina(-dryRunCost)
      currentUser.save()
    } else {
      res.send([
        `:error: スタミナが足りません`,
        `スタミナ ${getProgressBar(currentUser.stamina(), currentUser.capacity)}`,
        `(お試しおなかうらないをするにはスタミナが${dryRunCost}必要です)`
      ].join('\n'))
    }
  })

  robot.respond(/(スタミナ|stamina)$/, res => {
    const currentUser = new User(res.message.user.id)

    res.send(`Stamina: ${getProgressBar(currentUser.stamina(), currentUser.capacity)}`)
  })

  robot.respond(/(コレクション|collection)$/, res => {
    const currentUser = new User(res.message.user.id)

    const result = Object.entries(currentUser.collection || {})
      .sort((a, b) => onakaStatuses[a[0]].freq - onakaStatuses[b[0]].freq)
      .map(([rarity, cols]) => [
        `*[${rarity}]* (${Object.keys(cols).length}/${onakaStatuses[rarity].statuses.length})`,
        Object.entries(cols).map(([status, num]) => `- ${status} ...... ${num}回`).join('\n')
      ].join('\n')).join('\n\n')

    res.send(result)
  })

  robot.respond(/(スコア|score)$/, res => {
    const currentUser = new User(res.message.user.id)
    const ranking = new Ranking()

    res.send(`Score: ${currentUser.score()}pts ${ranking.getRank(currentUser.userId)}位 (${ranking.numberOfParticipants()}人中)`)
  })

  robot.respond(/(チャレンジ|challenge) ?([0-9]+)?$/, res => {
    const currentUser = new User(res.message.user.id)
    const currentStamina = currentUser.stamina()
    const target = parseInt(res.match[2] || currentStamina * 2)

    const prob = currentStamina / target

    if (currentStamina >= target) {
      res.send([
        `引数には現在のスタミナより大きな整数をご指定ください。`
      ].join('\n'))
    } else if (currentStamina >= 1) {
      let result = null
      if (Math.random() < prob) {
        currentUser.increaseStamina(0, target - currentStamina)
        result = [
          `${target} になりました。`,
          `おめでとうございます！`
        ].join('\n')
      } else {
        currentUser.increaseStamina(0, -currentUser.stamina)
        result = [
          `0 になりました。`,
          `残念でした。^p^`
        ].join('\n')
      }
      currentUser.save();

      (async () => {
        res.send(`チャレンジを開始します。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`現在、あなたのスタミナは${currentStamina}です。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`今回のチャレンジでは、${Math.round(prob * 100)}% の確率でスタミナが ${target} になります。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`チャレンジに失敗するとスタミナが 0 になります。`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        res.send(`あなたのスタミナは・・・`)
        await new Promise(resolve => setTimeout(resolve, 8000))
        res.send(result)
      })()
    } else {
      res.send([
        `:error: スタミナが足りません`,
        `スタミナ ${getProgressBar(currentStamina, currentUser.capacity)}`,
        `(チャレンジにはスタミナが1以上必要です)`
      ].join('\n'))
    }
  })

  robot.respond(/(ヘルプ|help)$/, res => {
    res.send([
      `*onaka ヘルプ*`,
      `*onaka help*`,
      `    おなか bot の使い方を表示します。`,
      ``,
      `*onaka ？*`,
      `*onaka ?*`,
      `    おなかうらないをします。`,
      `    1回15スタミナを消費します。`,
      `    疑問符を複数連続させることで、その数だけうらなうことができます。`,
      ``,
      `*onaka チャレンジ*`,
      `*onaka challenge*`,
      `    スタミナを賭けて博打をおこないます。`,
      `    チャレンジにはスタミナが1以上必要です。`,
      `    なお本機能の利用は非推奨です。`,
      ``,
      `*onaka スタミナ*`,
      `*onaka stamina*`,
      `    現在のスタミナを表示します。`,
      `    スタミナは12分に1回復します。`,
      ``,
      `*onaka コレクション*`,
      `*onaka collection*`,
      `    現在までに取得したおなかステータスのコレクションを表示します。`,
      ``,
      `*onaka スコア*`,
      `*onaka score*`,
      `    コレクションによって決定されるスコアを表示します。`,
      ``
    ].join('\n'))
  })
}
