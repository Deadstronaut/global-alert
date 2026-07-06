// One-off script: adds the hazardTaxonomy i18n key block (spec 010) to all
// 7 locale files. Run once; safe to re-run (overwrites the same keys).
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const blocks = {
  en: {
    tabLabel: 'Hazard Taxonomy', addButton: '+ Add Hazard Type', editTitle: 'Edit Hazard Type', createTitle: 'Add Hazard Type',
    code: 'Code', displayName: 'Display Name', category: 'Category', description: 'Description',
    status: 'Status', active: 'Active', inactive: 'Inactive', edit: 'edit', editThresholds: 'edit thresholds',
    deactivate: 'deactivate', reactivate: 'reactivate', empty: 'No hazard types yet.',
    codeRequired: 'Code is required.', displayNameRequired: 'Display name is required.', duplicateCode: 'A hazard type with this code already exists.',
    save: 'Save', cancel: 'Cancel',
    thresholdsFor: 'Severity thresholds for', metricName: 'Metric Name', metricRequired: 'Metric name is required.', unit: 'Unit',
    breakpointsHint: 'Ordered breakpoints (minimum value → severity), lowest first.', addBreakpoint: 'Add breakpoint',
    breakpointsNotAscending: 'Breakpoint minimum values must be strictly ascending.',
  },
  tr: {
    tabLabel: 'Hazard Taksonomisi', addButton: '+ Afet Tipi Ekle', editTitle: 'Afet Tipini Düzenle', createTitle: 'Yeni Afet Tipi Ekle',
    code: 'Kod', displayName: 'Görünen Ad', category: 'Kategori', description: 'Açıklama',
    status: 'Durum', active: 'Aktif', inactive: 'Pasif', edit: 'düzenle', editThresholds: 'eşikleri düzenle',
    deactivate: 'deaktive et', reactivate: 'aktive et', empty: 'Henüz afet tipi eklenmedi.',
    codeRequired: 'Kod zorunludur.', displayNameRequired: 'Görünen ad zorunludur.', duplicateCode: 'Bu kod ile bir afet tipi zaten kayıtlı.',
    save: 'Kaydet', cancel: 'İptal',
    thresholdsFor: 'Şiddet eşikleri', metricName: 'Metrik Adı', metricRequired: 'Metrik adı zorunludur.', unit: 'Birim',
    breakpointsHint: 'Sıralı eşikler (minimum değer → şiddet), en düşükten başlayarak.', addBreakpoint: 'Eşik ekle',
    breakpointsNotAscending: 'Eşik minimum değerleri kesinlikle artan sırada olmalı.',
  },
  es: {
    tabLabel: 'Taxonomía de Peligros', addButton: '+ Añadir Tipo de Peligro', editTitle: 'Editar Tipo de Peligro', createTitle: 'Añadir Tipo de Peligro',
    code: 'Código', displayName: 'Nombre', category: 'Categoría', description: 'Descripción',
    status: 'Estado', active: 'Activo', inactive: 'Inactivo', edit: 'editar', editThresholds: 'editar umbrales',
    deactivate: 'desactivar', reactivate: 'reactivar', empty: 'Aún no hay tipos de peligro.',
    codeRequired: 'El código es obligatorio.', displayNameRequired: 'El nombre es obligatorio.', duplicateCode: 'Ya existe un tipo de peligro con este código.',
    save: 'Guardar', cancel: 'Cancelar',
    thresholdsFor: 'Umbrales de severidad para', metricName: 'Nombre de Métrica', metricRequired: 'El nombre de métrica es obligatorio.', unit: 'Unidad',
    breakpointsHint: 'Umbrales ordenados (valor mínimo → severidad), del más bajo al más alto.', addBreakpoint: 'Añadir umbral',
    breakpointsNotAscending: 'Los valores mínimos de los umbrales deben ser estrictamente ascendentes.',
  },
  fr: {
    tabLabel: 'Taxonomie des Risques', addButton: '+ Ajouter un Type de Risque', editTitle: 'Modifier le Type de Risque', createTitle: 'Ajouter un Type de Risque',
    code: 'Code', displayName: 'Nom Affiché', category: 'Catégorie', description: 'Description',
    status: 'Statut', active: 'Actif', inactive: 'Inactif', edit: 'modifier', editThresholds: 'modifier les seuils',
    deactivate: 'désactiver', reactivate: 'réactiver', empty: 'Aucun type de risque pour le moment.',
    codeRequired: 'Le code est requis.', displayNameRequired: 'Le nom affiché est requis.', duplicateCode: 'Un type de risque avec ce code existe déjà.',
    save: 'Enregistrer', cancel: 'Annuler',
    thresholdsFor: 'Seuils de gravité pour', metricName: 'Nom de la Métrique', metricRequired: 'Le nom de la métrique est requis.', unit: 'Unité',
    breakpointsHint: 'Seuils ordonnés (valeur minimale → gravité), du plus bas au plus élevé.', addBreakpoint: 'Ajouter un seuil',
    breakpointsNotAscending: 'Les valeurs minimales des seuils doivent être strictement croissantes.',
  },
  ru: {
    tabLabel: 'Таксономия Угроз', addButton: '+ Добавить Тип Угрозы', editTitle: 'Редактировать Тип Угрозы', createTitle: 'Добавить Тип Угрозы',
    code: 'Код', displayName: 'Отображаемое Имя', category: 'Категория', description: 'Описание',
    status: 'Статус', active: 'Активен', inactive: 'Неактивен', edit: 'редактировать', editThresholds: 'редактировать пороги',
    deactivate: 'деактивировать', reactivate: 'активировать', empty: 'Типов угроз пока нет.',
    codeRequired: 'Код обязателен.', displayNameRequired: 'Отображаемое имя обязательно.', duplicateCode: 'Тип угрозы с этим кодом уже существует.',
    save: 'Сохранить', cancel: 'Отмена',
    thresholdsFor: 'Пороги серьёзности для', metricName: 'Название Метрики', metricRequired: 'Название метрики обязательно.', unit: 'Единица',
    breakpointsHint: 'Упорядоченные пороги (минимальное значение → серьёзность), от низшего к высшему.', addBreakpoint: 'Добавить порог',
    breakpointsNotAscending: 'Минимальные значения порогов должны строго возрастать.',
  },
  ar: {
    tabLabel: 'تصنيف الأخطار', addButton: '+ إضافة نوع خطر', editTitle: 'تعديل نوع الخطر', createTitle: 'إضافة نوع خطر',
    code: 'الرمز', displayName: 'الاسم المعروض', category: 'الفئة', description: 'الوصف',
    status: 'الحالة', active: 'نشط', inactive: 'غير نشط', edit: 'تعديل', editThresholds: 'تعديل العتبات',
    deactivate: 'إلغاء التفعيل', reactivate: 'إعادة التفعيل', empty: 'لا توجد أنواع أخطار بعد.',
    codeRequired: 'الرمز مطلوب.', displayNameRequired: 'الاسم المعروض مطلوب.', duplicateCode: 'يوجد نوع خطر بهذا الرمز بالفعل.',
    save: 'حفظ', cancel: 'إلغاء',
    thresholdsFor: 'عتبات الشدة لـ', metricName: 'اسم المقياس', metricRequired: 'اسم المقياس مطلوب.', unit: 'الوحدة',
    breakpointsHint: 'عتبات مرتبة (القيمة الدنيا ← الشدة)، من الأدنى إلى الأعلى.', addBreakpoint: 'إضافة عتبة',
    breakpointsNotAscending: 'يجب أن تكون القيم الدنيا للعتبات تصاعدية بشكل صارم.',
  },
  zh: {
    tabLabel: '灾害分类', addButton: '+ 添加灾害类型', editTitle: '编辑灾害类型', createTitle: '添加灾害类型',
    code: '代码', displayName: '显示名称', category: '类别', description: '描述',
    status: '状态', active: '已启用', inactive: '已停用', edit: '编辑', editThresholds: '编辑阈值',
    deactivate: '停用', reactivate: '启用', empty: '尚无灾害类型。',
    codeRequired: '代码为必填项。', displayNameRequired: '显示名称为必填项。', duplicateCode: '该代码的灾害类型已存在。',
    save: '保存', cancel: '取消',
    thresholdsFor: '严重性阈值：', metricName: '指标名称', metricRequired: '指标名称为必填项。', unit: '单位',
    breakpointsHint: '有序阈值（最小值 → 严重性），从低到高。', addBreakpoint: '添加阈值',
    breakpointsNotAscending: '阈值的最小值必须严格递增。',
  },
};

for (const [locale, block] of Object.entries(blocks)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  json.hazardTaxonomy = block;
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('updated', locale);
}
