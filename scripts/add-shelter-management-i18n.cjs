// One-off script: adds the `shelters` i18n key block (spec 021) to all 7
// locale files. Run once; safe to re-run (overwrites the same keys).
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const blocks = {
  en: {
    tabLabel: 'Shelters', addButton: '+ Add Shelter', editTitle: 'Edit Shelter', createTitle: 'Add Shelter',
    name: 'Name', country: 'Country', lat: 'Latitude', lng: 'Longitude',
    capacity: 'Capacity (occupied/total)', capacityTotal: 'Total Capacity', capacityOccupied: 'Current Occupancy',
    occupancyPercent: 'Occupancy %', status: 'Status',
    statusOptions: { open: 'Open', closed: 'Closed', full: 'Full' },
    linkedIncident: 'Linked Incident', noLinkedIncident: '— none —',
    active: 'Active', inactive: 'Inactive', edit: 'edit', deactivate: 'deactivate', reactivate: 'reactivate',
    empty: 'No shelters yet.', save: 'Save', cancel: 'Cancel',
    nameRequired: 'Name is required.', noCountry: 'Country is required.',
    capacityTotalInvalid: 'Total capacity must be a positive number.',
    occupancyExceedsCapacity: 'Current occupancy cannot exceed total capacity.',
  },
  tr: {
    tabLabel: 'Sığınaklar', addButton: '+ Sığınak Ekle', editTitle: 'Sığınağı Düzenle', createTitle: 'Yeni Sığınak Ekle',
    name: 'İsim', country: 'Ülke', lat: 'Enlem', lng: 'Boylam',
    capacity: 'Kapasite (dolu/toplam)', capacityTotal: 'Toplam Kapasite', capacityOccupied: 'Mevcut Doluluk',
    occupancyPercent: 'Doluluk %', status: 'Durum',
    statusOptions: { open: 'Açık', closed: 'Kapalı', full: 'Dolu' },
    linkedIncident: 'Bağlı Olay', noLinkedIncident: '— yok —',
    active: 'Aktif', inactive: 'Pasif', edit: 'düzenle', deactivate: 'deaktive et', reactivate: 'aktive et',
    empty: 'Henüz sığınak eklenmedi.', save: 'Kaydet', cancel: 'İptal',
    nameRequired: 'İsim zorunludur.', noCountry: 'Ülke zorunludur.',
    capacityTotalInvalid: 'Toplam kapasite pozitif bir sayı olmalıdır.',
    occupancyExceedsCapacity: 'Mevcut doluluk toplam kapasiteyi geçemez.',
  },
  es: {
    tabLabel: 'Refugios', addButton: '+ Añadir Refugio', editTitle: 'Editar Refugio', createTitle: 'Añadir Refugio',
    name: 'Nombre', country: 'País', lat: 'Latitud', lng: 'Longitud',
    capacity: 'Capacidad (ocupada/total)', capacityTotal: 'Capacidad Total', capacityOccupied: 'Ocupación Actual',
    occupancyPercent: '% Ocupación', status: 'Estado',
    statusOptions: { open: 'Abierto', closed: 'Cerrado', full: 'Lleno' },
    linkedIncident: 'Incidente Vinculado', noLinkedIncident: '— ninguno —',
    active: 'Activo', inactive: 'Inactivo', edit: 'editar', deactivate: 'desactivar', reactivate: 'reactivar',
    empty: 'Aún no hay refugios.', save: 'Guardar', cancel: 'Cancelar',
    nameRequired: 'El nombre es obligatorio.', noCountry: 'El país es obligatorio.',
    capacityTotalInvalid: 'La capacidad total debe ser un número positivo.',
    occupancyExceedsCapacity: 'La ocupación actual no puede superar la capacidad total.',
  },
  fr: {
    tabLabel: 'Abris', addButton: '+ Ajouter un Abri', editTitle: "Modifier l'Abri", createTitle: 'Ajouter un Abri',
    name: 'Nom', country: 'Pays', lat: 'Latitude', lng: 'Longitude',
    capacity: 'Capacité (occupée/totale)', capacityTotal: 'Capacité Totale', capacityOccupied: 'Occupation Actuelle',
    occupancyPercent: '% Occupation', status: 'Statut',
    statusOptions: { open: 'Ouvert', closed: 'Fermé', full: 'Complet' },
    linkedIncident: 'Incident Lié', noLinkedIncident: '— aucun —',
    active: 'Actif', inactive: 'Inactif', edit: 'modifier', deactivate: 'désactiver', reactivate: 'réactiver',
    empty: "Aucun abri pour le moment.", save: 'Enregistrer', cancel: 'Annuler',
    nameRequired: 'Le nom est requis.', noCountry: 'Le pays est requis.',
    capacityTotalInvalid: 'La capacité totale doit être un nombre positif.',
    occupancyExceedsCapacity: "L'occupation actuelle ne peut pas dépasser la capacité totale.",
  },
  ru: {
    tabLabel: 'Убежища', addButton: '+ Добавить Убежище', editTitle: 'Редактировать Убежище', createTitle: 'Добавить Убежище',
    name: 'Название', country: 'Страна', lat: 'Широта', lng: 'Долгота',
    capacity: 'Вместимость (занято/всего)', capacityTotal: 'Общая Вместимость', capacityOccupied: 'Текущая Заполненность',
    occupancyPercent: '% Заполненности', status: 'Статус',
    statusOptions: { open: 'Открыто', closed: 'Закрыто', full: 'Заполнено' },
    linkedIncident: 'Связанное Происшествие', noLinkedIncident: '— нет —',
    active: 'Активно', inactive: 'Неактивно', edit: 'редактировать', deactivate: 'деактивировать', reactivate: 'активировать',
    empty: 'Убежищ пока нет.', save: 'Сохранить', cancel: 'Отмена',
    nameRequired: 'Название обязательно.', noCountry: 'Страна обязательна.',
    capacityTotalInvalid: 'Общая вместимость должна быть положительным числом.',
    occupancyExceedsCapacity: 'Текущая заполненность не может превышать общую вместимость.',
  },
  ar: {
    tabLabel: 'الملاجئ', addButton: '+ إضافة ملجأ', editTitle: 'تعديل الملجأ', createTitle: 'إضافة ملجأ',
    name: 'الاسم', country: 'الدولة', lat: 'خط العرض', lng: 'خط الطول',
    capacity: 'السعة (المشغولة/الإجمالية)', capacityTotal: 'السعة الإجمالية', capacityOccupied: 'الإشغال الحالي',
    occupancyPercent: 'نسبة الإشغال', status: 'الحالة',
    statusOptions: { open: 'مفتوح', closed: 'مغلق', full: 'ممتلئ' },
    linkedIncident: 'الحادث المرتبط', noLinkedIncident: '— لا شيء —',
    active: 'نشط', inactive: 'غير نشط', edit: 'تعديل', deactivate: 'إلغاء التفعيل', reactivate: 'إعادة التفعيل',
    empty: 'لا توجد ملاجئ بعد.', save: 'حفظ', cancel: 'إلغاء',
    nameRequired: 'الاسم مطلوب.', noCountry: 'الدولة مطلوبة.',
    capacityTotalInvalid: 'يجب أن تكون السعة الإجمالية رقمًا موجبًا.',
    occupancyExceedsCapacity: 'لا يمكن أن يتجاوز الإشغال الحالي السعة الإجمالية.',
  },
  zh: {
    tabLabel: '避难所', addButton: '+ 添加避难所', editTitle: '编辑避难所', createTitle: '添加避难所',
    name: '名称', country: '国家', lat: '纬度', lng: '经度',
    capacity: '容量（已占用/总计）', capacityTotal: '总容量', capacityOccupied: '当前占用人数',
    occupancyPercent: '占用率', status: '状态',
    statusOptions: { open: '开放', closed: '关闭', full: '已满' },
    linkedIncident: '关联事件', noLinkedIncident: '— 无 —',
    active: '已启用', inactive: '已停用', edit: '编辑', deactivate: '停用', reactivate: '启用',
    empty: '尚无避难所。', save: '保存', cancel: '取消',
    nameRequired: '名称为必填项。', noCountry: '国家为必填项。',
    capacityTotalInvalid: '总容量必须为正数。',
    occupancyExceedsCapacity: '当前占用人数不能超过总容量。',
  },
};

for (const [locale, block] of Object.entries(blocks)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  json.shelters = block;
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('updated', locale);
}
