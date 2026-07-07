// One-off i18n injector for spec 032 (Drill Reporting & After-Action
// Feedback). Adds audit.drillReports.* and admin.drill*.* keys to all 7
// locales, merging into the existing audit/admin objects.
const fs = require('fs')
const path = require('path')

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales')

const STRINGS = {
  tr: {
    audit: {
      drillReports: {
        title: 'Yıllık Tatbikat Raporları',
        empty: 'Henüz otomatik tatbikat raporu üretilmedi.',
        total: 'Toplam Tatbikat',
      },
    },
    admin: {
      drillExportSummary: 'Özeti Dışa Aktar',
      drillLessonsLearned: 'Ders Çıkarımı Notu',
      drillRelatedHazard: 'İlgili Afet Tipi (isteğe bağlı)',
      drillSaveFeedback: 'Kaydet',
      drillGoToThresholdEditor: 'Eşik Düzenleyiciye Git →',
    },
  },
  en: {
    audit: {
      drillReports: {
        title: 'Annual Drill Reports',
        empty: 'No automatic drill report has been generated yet.',
        total: 'Total Drills',
      },
    },
    admin: {
      drillExportSummary: 'Export Summary',
      drillLessonsLearned: 'Lessons Learned Note',
      drillRelatedHazard: 'Related Hazard Type (optional)',
      drillSaveFeedback: 'Save',
      drillGoToThresholdEditor: 'Go to Threshold Editor →',
    },
  },
  es: {
    audit: {
      drillReports: {
        title: 'Informes Anuales de Simulacros',
        empty: 'Aún no se ha generado ningún informe automático de simulacro.',
        total: 'Total de Simulacros',
      },
    },
    admin: {
      drillExportSummary: 'Exportar Resumen',
      drillLessonsLearned: 'Nota de Lecciones Aprendidas',
      drillRelatedHazard: 'Tipo de Riesgo Relacionado (opcional)',
      drillSaveFeedback: 'Guardar',
      drillGoToThresholdEditor: 'Ir al Editor de Umbrales →',
    },
  },
  fr: {
    audit: {
      drillReports: {
        title: 'Rapports Annuels d\'Exercices',
        empty: "Aucun rapport automatique d'exercice n'a encore été généré.",
        total: "Total d'Exercices",
      },
    },
    admin: {
      drillExportSummary: 'Exporter le Résumé',
      drillLessonsLearned: 'Note de Leçons Apprises',
      drillRelatedHazard: 'Type de Risque Associé (facultatif)',
      drillSaveFeedback: 'Enregistrer',
      drillGoToThresholdEditor: "Aller à l'Éditeur de Seuils →",
    },
  },
  ru: {
    audit: {
      drillReports: {
        title: 'Годовые Отчёты по Учениям',
        empty: 'Автоматический отчёт по учениям ещё не создавался.',
        total: 'Всего Учений',
      },
    },
    admin: {
      drillExportSummary: 'Экспортировать Сводку',
      drillLessonsLearned: 'Заметка о Извлечённых Уроках',
      drillRelatedHazard: 'Связанный Тип Опасности (необязательно)',
      drillSaveFeedback: 'Сохранить',
      drillGoToThresholdEditor: 'Перейти к Редактору Порогов →',
    },
  },
  ar: {
    audit: {
      drillReports: {
        title: 'التقارير السنوية للتدريبات',
        empty: 'لم يتم إنشاء أي تقرير تدريب تلقائي بعد.',
        total: 'إجمالي التدريبات',
      },
    },
    admin: {
      drillExportSummary: 'تصدير الملخص',
      drillLessonsLearned: 'ملاحظة الدروس المستفادة',
      drillRelatedHazard: 'نوع الخطر المرتبط (اختياري)',
      drillSaveFeedback: 'حفظ',
      drillGoToThresholdEditor: 'الانتقال إلى محرر العتبات ←',
    },
  },
  zh: {
    audit: {
      drillReports: {
        title: '年度演习报告',
        empty: '尚未生成自动演习报告。',
        total: '演习总数',
      },
    },
    admin: {
      drillExportSummary: '导出摘要',
      drillLessonsLearned: '经验教训记录',
      drillRelatedHazard: '相关灾害类型(可选)',
      drillSaveFeedback: '保存',
      drillGoToThresholdEditor: '前往阈值编辑器 →',
    },
  },
}

for (const [locale, strings] of Object.entries(STRINGS)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!data.audit) data.audit = {}
  data.audit.drillReports = strings.audit.drillReports
  if (!data.admin) data.admin = {}
  Object.assign(data.admin, strings.admin)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`Updated ${locale}.json`)
}
