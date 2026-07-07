// One-off i18n injector for spec 034 (Impact Analysis Gaps). Adds
// impact.panel.* keys, assetCategory.* keys, and dispatch.* keys to all 7
// locales, merging into existing objects.
const fs = require('fs')
const path = require('path')

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales')

const IMPACT_PANEL = {
  tr: {
    completenessLabel: 'Veri Tamlığı',
    completenessNoData: 'veri yok',
    criticalInfrastructureTitle: 'Kritik Altyapı',
    criticalInfrastructureEmpty: 'Bu alanda kritik altyapı verisi yok.',
    breakdownTitle: 'Kırılım',
    breakdownBySector: 'Sektöre Göre',
    breakdownByBoundary: 'İdari Sınıra Göre',
    breakdownEmpty: 'Kırılım verisi yok.',
    unclassified: 'sınıflandırılmamış',
  },
  en: {
    completenessLabel: 'Data Completeness',
    completenessNoData: 'no data',
    criticalInfrastructureTitle: 'Critical Infrastructure',
    criticalInfrastructureEmpty: 'No critical infrastructure in this area.',
    breakdownTitle: 'Breakdown',
    breakdownBySector: 'By Sector',
    breakdownByBoundary: 'By Admin Boundary',
    breakdownEmpty: 'No breakdown data.',
    unclassified: 'unclassified',
  },
  es: {
    completenessLabel: 'Integridad de Datos',
    completenessNoData: 'sin datos',
    criticalInfrastructureTitle: 'Infraestructura Crítica',
    criticalInfrastructureEmpty: 'No hay infraestructura crítica en esta área.',
    breakdownTitle: 'Desglose',
    breakdownBySector: 'Por Sector',
    breakdownByBoundary: 'Por Límite Administrativo',
    breakdownEmpty: 'No hay datos de desglose.',
    unclassified: 'sin clasificar',
  },
  fr: {
    completenessLabel: 'Intégrité des Données',
    completenessNoData: 'aucune donnée',
    criticalInfrastructureTitle: 'Infrastructures Critiques',
    criticalInfrastructureEmpty: "Aucune infrastructure critique dans cette zone.",
    breakdownTitle: 'Ventilation',
    breakdownBySector: 'Par Secteur',
    breakdownByBoundary: 'Par Limite Administrative',
    breakdownEmpty: 'Aucune donnée de ventilation.',
    unclassified: 'non classé',
  },
  ru: {
    completenessLabel: 'Полнота Данных',
    completenessNoData: 'нет данных',
    criticalInfrastructureTitle: 'Критическая Инфраструктура',
    criticalInfrastructureEmpty: 'В этой зоне нет критической инфраструктуры.',
    breakdownTitle: 'Разбивка',
    breakdownBySector: 'По Сектору',
    breakdownByBoundary: 'По Административной Границе',
    breakdownEmpty: 'Нет данных разбивки.',
    unclassified: 'без категории',
  },
  ar: {
    completenessLabel: 'اكتمال البيانات',
    completenessNoData: 'لا توجد بيانات',
    criticalInfrastructureTitle: 'البنية التحتية الحرجة',
    criticalInfrastructureEmpty: 'لا توجد بنية تحتية حرجة في هذه المنطقة.',
    breakdownTitle: 'التوزيع',
    breakdownBySector: 'حسب القطاع',
    breakdownByBoundary: 'حسب الحدود الإدارية',
    breakdownEmpty: 'لا توجد بيانات توزيع.',
    unclassified: 'غير مصنف',
  },
  zh: {
    completenessLabel: '数据完整度',
    completenessNoData: '无数据',
    criticalInfrastructureTitle: '关键基础设施',
    criticalInfrastructureEmpty: '该区域没有关键基础设施数据。',
    breakdownTitle: '细分',
    breakdownBySector: '按行业',
    breakdownByBoundary: '按行政边界',
    breakdownEmpty: '没有细分数据。',
    unclassified: '未分类',
  },
}

const ASSET_CATEGORY = {
  tr: {
    critical_infrastructure_health: 'Sağlık Tesisi',
    critical_infrastructure_education: 'Eğitim Kurumu',
    critical_infrastructure_emergency: 'Acil Durum Hizmeti',
  },
  en: {
    critical_infrastructure_health: 'Health Facility',
    critical_infrastructure_education: 'Education Facility',
    critical_infrastructure_emergency: 'Emergency Service',
  },
  es: {
    critical_infrastructure_health: 'Centro de Salud',
    critical_infrastructure_education: 'Centro Educativo',
    critical_infrastructure_emergency: 'Servicio de Emergencia',
  },
  fr: {
    critical_infrastructure_health: 'Établissement de Santé',
    critical_infrastructure_education: 'Établissement Éducatif',
    critical_infrastructure_emergency: "Service d'Urgence",
  },
  ru: {
    critical_infrastructure_health: 'Медицинское Учреждение',
    critical_infrastructure_education: 'Образовательное Учреждение',
    critical_infrastructure_emergency: 'Экстренная Служба',
  },
  ar: {
    critical_infrastructure_health: 'منشأة صحية',
    critical_infrastructure_education: 'مؤسسة تعليمية',
    critical_infrastructure_emergency: 'خدمة طوارئ',
  },
  zh: {
    critical_infrastructure_health: '卫生设施',
    critical_infrastructure_education: '教育机构',
    critical_infrastructure_emergency: '应急服务',
  },
}

const DISPATCH = {
  tr: {
    viewImpactSnapshot: 'etki anlık görüntüsü',
    hideImpactSnapshot: 'gizle',
    impactSnapshotUnavailable: 'Yayın anında impact verisi mevcut değildi.',
  },
  en: {
    viewImpactSnapshot: 'view impact snapshot',
    hideImpactSnapshot: 'hide',
    impactSnapshotUnavailable: 'Impact data was not available at broadcast time.',
  },
  es: {
    viewImpactSnapshot: 'ver instantánea de impacto',
    hideImpactSnapshot: 'ocultar',
    impactSnapshotUnavailable: 'Los datos de impacto no estaban disponibles al momento de la difusión.',
  },
  fr: {
    viewImpactSnapshot: "voir l'instantané d'impact",
    hideImpactSnapshot: 'masquer',
    impactSnapshotUnavailable: "Les données d'impact n'étaient pas disponibles au moment de la diffusion.",
  },
  ru: {
    viewImpactSnapshot: 'просмотр снимка воздействия',
    hideImpactSnapshot: 'скрыть',
    impactSnapshotUnavailable: 'Данные о воздействии были недоступны на момент трансляции.',
  },
  ar: {
    viewImpactSnapshot: 'عرض لقطة التأثير',
    hideImpactSnapshot: 'إخفاء',
    impactSnapshotUnavailable: 'لم تكن بيانات التأثير متوفرة وقت البث.',
  },
  zh: {
    viewImpactSnapshot: '查看影响快照',
    hideImpactSnapshot: '隐藏',
    impactSnapshotUnavailable: '广播时影响数据不可用。',
  },
}

for (const locale of Object.keys(IMPACT_PANEL)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!data.impact) data.impact = {}
  if (!data.impact.panel) data.impact.panel = {}
  Object.assign(data.impact.panel, IMPACT_PANEL[locale])
  if (!data.assetCategory) data.assetCategory = {}
  Object.assign(data.assetCategory, ASSET_CATEGORY[locale])
  if (!data.dispatch) data.dispatch = {}
  Object.assign(data.dispatch, DISPATCH[locale])
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`Updated ${locale}.json`)
}
