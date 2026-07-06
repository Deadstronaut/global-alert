// One-off i18n injector for spec 018 (Admin Panel Capability Grants). Adds
// admin.capabilities.* (column label + full/short label per capability) to
// all 7 locales.
const fs = require('fs')
const path = require('path')

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales')

const STRINGS = {
  tr: {
    columnLabel: 'Ek Yetkiler',
    hazard_taxonomy: 'Hazard Taxonomy yönetimi',
    hazard_taxonomyShort: 'Taxonomy',
    sop_repository: 'SOP Repository yönetimi',
    sop_repositoryShort: 'SOP',
    map_layers: 'Map Layers yönetimi',
    map_layersShort: 'Harita',
    audit: 'Audit görüntüleme',
    auditShort: 'Audit',
  },
  en: {
    columnLabel: 'Extra Capabilities',
    hazard_taxonomy: 'Manage Hazard Taxonomy',
    hazard_taxonomyShort: 'Taxonomy',
    sop_repository: 'Manage SOP Repository',
    sop_repositoryShort: 'SOP',
    map_layers: 'Manage Map Layers',
    map_layersShort: 'Map Layers',
    audit: 'View Audit Log',
    auditShort: 'Audit',
  },
  es: {
    columnLabel: 'Capacidades Adicionales',
    hazard_taxonomy: 'Gestionar Taxonomía de Peligros',
    hazard_taxonomyShort: 'Taxonomía',
    sop_repository: 'Gestionar Repositorio de POE',
    sop_repositoryShort: 'POE',
    map_layers: 'Gestionar Capas del Mapa',
    map_layersShort: 'Capas',
    audit: 'Ver Registro de Auditoría',
    auditShort: 'Auditoría',
  },
  fr: {
    columnLabel: 'Capacités Supplémentaires',
    hazard_taxonomy: 'Gérer la Taxonomie des Risques',
    hazard_taxonomyShort: 'Taxonomie',
    sop_repository: 'Gérer le Dépôt des POS',
    sop_repositoryShort: 'POS',
    map_layers: 'Gérer les Couches de Carte',
    map_layersShort: 'Couches',
    audit: "Voir le Journal d'Audit",
    auditShort: 'Audit',
  },
  ru: {
    columnLabel: 'Доп. Полномочия',
    hazard_taxonomy: 'Управление таксономией опасностей',
    hazard_taxonomyShort: 'Таксономия',
    sop_repository: 'Управление репозиторием СОП',
    sop_repositoryShort: 'СОП',
    map_layers: 'Управление слоями карты',
    map_layersShort: 'Слои карты',
    audit: 'Просмотр журнала аудита',
    auditShort: 'Аудит',
  },
  ar: {
    columnLabel: 'صلاحيات إضافية',
    hazard_taxonomy: 'إدارة تصنيف المخاطر',
    hazard_taxonomyShort: 'التصنيف',
    sop_repository: 'إدارة مستودع إجراءات التشغيل',
    sop_repositoryShort: 'الإجراءات',
    map_layers: 'إدارة طبقات الخريطة',
    map_layersShort: 'الطبقات',
    audit: 'عرض سجل التدقيق',
    auditShort: 'التدقيق',
  },
  zh: {
    columnLabel: '附加权限',
    hazard_taxonomy: '管理灾害分类',
    hazard_taxonomyShort: '分类',
    sop_repository: '管理SOP文档库',
    sop_repositoryShort: 'SOP',
    map_layers: '管理地图图层',
    map_layersShort: '图层',
    audit: '查看审计日志',
    auditShort: '审计',
  },
}

for (const [locale, strings] of Object.entries(STRINGS)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!data.admin) data.admin = {}
  data.admin.capabilities = strings
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`Updated ${locale}.json`)
}
