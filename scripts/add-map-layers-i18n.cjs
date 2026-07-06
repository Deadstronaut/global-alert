// One-off script: adds the mapLayers i18n key block (spec 012) to all
// 7 locale files. Run once; safe to re-run (overwrites the same keys).
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const blocks = {
  en: {
    tabLabel: 'Map Layers', addButton: '+ Add Layer', editTitle: 'Edit Map Layer', createTitle: 'Add Map Layer',
    displayName: 'Display Name', sourceType: 'Source Type', endpointUrl: 'Endpoint URL', layerName: 'Layer/Feature Type Name',
    status: 'Status', active: 'Active', inactive: 'Inactive', edit: 'edit', deactivate: 'deactivate', reactivate: 'reactivate',
    empty: 'No map layers yet.',
    displayNameRequired: 'Display name is required.', endpointUrlRequired: 'Endpoint URL is required.',
    layerNameRequired: 'Layer/feature type name is required.',
    unsafeUrl: 'This endpoint URL is not allowed (must be HTTPS and a public address).',
    save: 'Save', cancel: 'Cancel',
    panelTitle: 'Map Layers',
  },
  tr: {
    tabLabel: 'Harita Katmanları', addButton: '+ Katman Ekle', editTitle: 'Harita Katmanını Düzenle', createTitle: 'Harita Katmanı Ekle',
    displayName: 'Görünen Ad', sourceType: 'Kaynak Tipi', endpointUrl: 'Uç Nokta URL', layerName: 'Katman/Özellik Tipi Adı',
    status: 'Durum', active: 'Aktif', inactive: 'Pasif', edit: 'düzenle', deactivate: 'deaktive et', reactivate: 'aktive et',
    empty: 'Henüz harita katmanı eklenmedi.',
    displayNameRequired: 'Görünen ad zorunludur.', endpointUrlRequired: 'Uç nokta URL zorunludur.',
    layerNameRequired: 'Katman/özellik tipi adı zorunludur.',
    unsafeUrl: 'Bu uç nokta URL\'sine izin verilmiyor (HTTPS ve genel bir adres olmalı).',
    save: 'Kaydet', cancel: 'İptal',
    panelTitle: 'Harita Katmanları',
  },
  es: {
    tabLabel: 'Capas de Mapa', addButton: '+ Añadir Capa', editTitle: 'Editar Capa de Mapa', createTitle: 'Añadir Capa de Mapa',
    displayName: 'Nombre', sourceType: 'Tipo de Fuente', endpointUrl: 'URL del Endpoint', layerName: 'Nombre de Capa/Tipo de Entidad',
    status: 'Estado', active: 'Activo', inactive: 'Inactivo', edit: 'editar', deactivate: 'desactivar', reactivate: 'reactivar',
    empty: 'Aún no hay capas de mapa.',
    displayNameRequired: 'El nombre es obligatorio.', endpointUrlRequired: 'La URL del endpoint es obligatoria.',
    layerNameRequired: 'El nombre de capa/tipo de entidad es obligatorio.',
    unsafeUrl: 'Esta URL de endpoint no está permitida (debe ser HTTPS y una dirección pública).',
    save: 'Guardar', cancel: 'Cancelar',
    panelTitle: 'Capas de Mapa',
  },
  fr: {
    tabLabel: 'Couches de Carte', addButton: '+ Ajouter une Couche', editTitle: 'Modifier la Couche', createTitle: 'Ajouter une Couche',
    displayName: 'Nom Affiché', sourceType: 'Type de Source', endpointUrl: "URL du Point d'accès", layerName: 'Nom de Couche/Type d\'Entité',
    status: 'Statut', active: 'Actif', inactive: 'Inactif', edit: 'modifier', deactivate: 'désactiver', reactivate: 'réactiver',
    empty: 'Aucune couche de carte pour le moment.',
    displayNameRequired: 'Le nom affiché est requis.', endpointUrlRequired: "L'URL du point d'accès est requise.",
    layerNameRequired: "Le nom de couche/type d'entité est requis.",
    unsafeUrl: "Cette URL de point d'accès n'est pas autorisée (doit être HTTPS et une adresse publique).",
    save: 'Enregistrer', cancel: 'Annuler',
    panelTitle: 'Couches de Carte',
  },
  ru: {
    tabLabel: 'Слои Карты', addButton: '+ Добавить Слой', editTitle: 'Редактировать Слой Карты', createTitle: 'Добавить Слой Карты',
    displayName: 'Отображаемое Имя', sourceType: 'Тип Источника', endpointUrl: 'URL Конечной Точки', layerName: 'Имя Слоя/Типа Объекта',
    status: 'Статус', active: 'Активен', inactive: 'Неактивен', edit: 'редактировать', deactivate: 'деактивировать', reactivate: 'активировать',
    empty: 'Слоев карты пока нет.',
    displayNameRequired: 'Отображаемое имя обязательно.', endpointUrlRequired: 'URL конечной точки обязателен.',
    layerNameRequired: 'Имя слоя/типа объекта обязательно.',
    unsafeUrl: 'Этот URL конечной точки не разрешен (должен быть HTTPS и публичным адресом).',
    save: 'Сохранить', cancel: 'Отмена',
    panelTitle: 'Слои Карты',
  },
  ar: {
    tabLabel: 'طبقات الخريطة', addButton: '+ إضافة طبقة', editTitle: 'تعديل طبقة الخريطة', createTitle: 'إضافة طبقة خريطة',
    displayName: 'الاسم المعروض', sourceType: 'نوع المصدر', endpointUrl: 'رابط نقطة النهاية', layerName: 'اسم الطبقة/نوع العنصر',
    status: 'الحالة', active: 'نشط', inactive: 'غير نشط', edit: 'تعديل', deactivate: 'إلغاء التفعيل', reactivate: 'إعادة التفعيل',
    empty: 'لا توجد طبقات خريطة بعد.',
    displayNameRequired: 'الاسم المعروض مطلوب.', endpointUrlRequired: 'رابط نقطة النهاية مطلوب.',
    layerNameRequired: 'اسم الطبقة/نوع العنصر مطلوب.',
    unsafeUrl: 'رابط نقطة النهاية هذا غير مسموح به (يجب أن يكون HTTPS وعنوانًا عامًا).',
    save: 'حفظ', cancel: 'إلغاء',
    panelTitle: 'طبقات الخريطة',
  },
  zh: {
    tabLabel: '地图图层', addButton: '+ 添加图层', editTitle: '编辑地图图层', createTitle: '添加地图图层',
    displayName: '显示名称', sourceType: '来源类型', endpointUrl: '端点URL', layerName: '图层/要素类型名称',
    status: '状态', active: '已启用', inactive: '已停用', edit: '编辑', deactivate: '停用', reactivate: '启用',
    empty: '尚无地图图层。',
    displayNameRequired: '显示名称为必填项。', endpointUrlRequired: '端点URL为必填项。',
    layerNameRequired: '图层/要素类型名称为必填项。',
    unsafeUrl: '不允许使用此端点URL（必须是HTTPS且为公共地址）。',
    save: '保存', cancel: '取消',
    panelTitle: '地图图层',
  },
};

for (const [locale, block] of Object.entries(blocks)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  json.mapLayers = block;
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('updated', locale);
}
