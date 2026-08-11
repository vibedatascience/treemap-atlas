import json, sys, io, urllib.request
import pandas as pd

DROP={'World','Asia','Africa','Europe','North America','South America','Oceania','European Union (27)','European Union (28)','European Union','High-income countries','Low-income countries','Upper-middle-income countries','Lower-middle-income countries','G20','G7','OECD','International transport','International aviation','International shipping','Non-OECD','CIS','Middle East','Central America','South and Central America','Eastern Africa','Western Africa','Middle Africa','Asia Pacific','USSR'}

def build(slug, title, unit, ds_id, src_org, min_year=1960):
    url=f'https://ourworldindata.org/grapher/{slug}.csv?useColumnShortNames=true'
    req=urllib.request.Request(url, headers={'User-Agent':'treemap-atlas'})
    df=pd.read_csv(io.BytesIO(urllib.request.urlopen(req).read()))
    vcol=df.columns[-1]
    df=df[df['code'].notna() & (df['code']!='OWID_WRL')]
    df=df[df[vcol].notna() & (df['year']>=min_year)]
    df=df[~df['entity'].isin(DROP) & ~df['entity'].str.contains('excl|Other ', regex=True)]
    years=sorted(df['year'].unique().tolist())
    piv=df.pivot_table(index='entity', columns='year', values=vcol, aggfunc='first')
    items=[]
    for name,row in piv.iterrows():
        vals=[round(float(row[y]),2) if y in row.index and row[y]==row[y] else None for y in years]
        items.append({"name":str(name),"value":vals[-1] if vals[-1] is not None else 0,"values":vals})
    items.sort(key=lambda x:-(x['value'] or 0))
    last=int(years[-1])
    out={"title":title,"unit":unit,"source":f"{src_org} via Our World in Data, {last}","source_url":f"https://ourworldindata.org/grapher/{slug}","date":str(last),"years":[int(y) for y in years],"items":items}
    json.dump(out, open(f'../datasets/{ds_id}.json','w'))
    print(ds_id, years[0], last, len(items), 'size_kb', len(json.dumps(out))//1024)

if __name__=='__main__':
    a=sys.argv[1:]
    build(a[0],a[1],a[2],a[3],a[4], int(a[5]) if len(a)>5 else 1960)
