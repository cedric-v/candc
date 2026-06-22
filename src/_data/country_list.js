const LOCALES = ['fr', 'en', 'de', 'es', 'pt', 'it', 'nl'];

const COUNTRY_CODES = [
  'CH','AF','ZA','AL','DZ','DE','AD','AO','AG','SA','AR','AM','AU','AT','AZ',
  'BS','BH','BD','BB','BE','BZ','BJ','BT','BY','MM','BO','BA','BW','BR',
  'BN','BG','BF','BI','CV','KH','CM','CA','CL','CN','CY','CO','KM','CG',
  'CD','KP','KR','CR','CI','HR','CU','DK','DJ','DM','EG','AE','EC','ER',
  'ES','EE','SZ','US','ET','FJ','FI','FR','GA','GM','GE','GH','GR','GD',
  'GT','GN','GQ','GW','GY','HT','HN','HU','IN','ID','IR','IQ','IE','IS',
  'IL','IT','JM','JP','JO','KZ','KE','KI','KW','KG','LA','LS','LV','LB',
  'LR','LY','LI','LT','LU','MK','MG','MW','MY','MV','ML','MT','MA','MH',
  'MU','MR','MX','FM','MD','MC','MN','ME','MZ','NA','NR','NP','NI','NE',
  'NG','NO','NC','NZ','OM','UG','UZ','PK','PW','PS','PA','PG','PY','NL',
  'PE','PH','PL','PT','QA','CF','DO','CZ','RO','GB','RU','RW','KN','SM',
  'LC','VC','SB','SV','WS','ST','SN','RS','SC','SL','SG','SK','SI','SO',
  'SD','SS','LK','SE','SR','SY','TJ','TZ','TD','TH','TL','TG','TO',
  'TT','TN','TM','TR','TV','UA','UY','VU','VA','VE','VN','YE','ZM','ZW',
];

module.exports = function () {
  const result = {};
  for (const locale of LOCALES) {
    try {
      const dn = new Intl.DisplayNames([locale], { type: 'region' });
      const list = COUNTRY_CODES.map(code => ({ code, name: dn.of(code) }));
      list.sort((a, b) => {
        if (a.code === 'CH') return -1;
        if (b.code === 'CH') return 1;
        return a.name.localeCompare(b.name, locale);
      });
      result[locale] = list;
    } catch {
      const dn = new Intl.DisplayNames(['en'], { type: 'region' });
      const list = COUNTRY_CODES.map(code => ({ code, name: dn.of(code) }));
      list.sort((a, b) => {
        if (a.code === 'CH') return -1;
        if (b.code === 'CH') return 1;
        return a.name.localeCompare(b.name, 'en');
      });
      result[locale] = list;
    }
  }
  return result;
};
