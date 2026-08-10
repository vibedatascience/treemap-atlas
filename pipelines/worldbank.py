import urllib.request, json, sys

AGGS={'WLD','IBD','IBT','IDA','IDB','IDX','LIC','LMC','LMY','MIC','UMC','HIC','EAR','EAS','EAP','TEA','ECS','ECA','TEC','EUU','EMU','FCS','HPC','LTE','LCN','LAC','TLA','LDC','MEA','MNA','TMN','NAC','OED','OSS','PSS','PST','PRE','SAS','TSA','SSF','SSA','TSS','AFE','AFW','ARB','CSS','CEB','SST'}

def region_map():
    url='https://api.worldbank.org/v2/country?format=json&per_page=400'
    cdata=json.load(urllib.request.urlopen(url))
    return {c['id']: c['region']['value'] for c in cdata[1] if c['region']['value']!='Aggregates'}

def build(indicator, year, title, unit, ds_id):
    region=region_map()
    url=f'https://api.worldbank.org/v2/country/all/indicator/{indicator}?date={year}&format=json&per_page=400'
    data=json.load(urllib.request.urlopen(url))
    rows=[(d['country']['value'], d['value'], d['countryiso3code']) for d in data[1] if d['value'] and d['countryiso3code'] in region]
    items=[{"name":n,"value":round(v,2),"parent":region[c],"color_key":region[c]} for n,v,c in rows]
    out={"title":title,"unit":unit,"source":f"World Bank {year}","date":str(year),"items":items}
    json.dump(out, open(f'../datasets/{ds_id}.json','w'))
    print(ds_id, len(items))

if __name__=='__main__':
    build(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
