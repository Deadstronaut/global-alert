// One-off i18n injector for spec 017 (Drill Response-Time and Participation
// Metrics). Adds admin.drillResponseTime / admin.drillAckRate /
// admin.drillNoData to all 7 locales.
const fs = require('fs')
const path = require('path')

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales')

const STRINGS = {
  tr: { responseTime: 'Tepki Süresi', ackRate: 'Onay Oranı', noData: 'veri yok' },
  en: { responseTime: 'Response Time', ackRate: 'Ack Rate', noData: 'no data' },
  es: { responseTime: 'Tiempo de Respuesta', ackRate: 'Tasa de Confirmación', noData: 'sin datos' },
  fr: { responseTime: 'Temps de Réponse', ackRate: "Taux d'Accusé", noData: 'aucune donnée' },
  ru: { responseTime: 'Время Реакции', ackRate: 'Уровень Подтверждения', noData: 'нет данных' },
  ar: { responseTime: 'وقت الاستجابة', ackRate: 'معدل التأكيد', noData: 'لا توجد بيانات' },
  zh: { responseTime: '响应时间', ackRate: '确认率', noData: '无数据' },
}

for (const [locale, strings] of Object.entries(STRINGS)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!data.admin) data.admin = {}
  data.admin.drillResponseTime = strings.responseTime
  data.admin.drillAckRate = strings.ackRate
  data.admin.drillNoData = strings.noData
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`Updated ${locale}.json`)
}
