import json, sys
from owid.catalog import Client

DROP={'World','Asia','Africa','Europe','North America','South America','Oceania','European Union (27)','European Union','High-income countries','Low-income countries','Upper-middle-income countries','Lower-middle-income countries','G20','G7','OECD','International transport'}

def build(slug, title, unit, ds_id, src_org, min_val=0):
    c=Client()
    df=c.charts.fetch(slug).reset_index()
    vcol=[x for x in df.columns if x not in ('entities','years')][0]
    y=int(df[df[vcol].notna()]['years'].max())
    sub=df[(df['years']==y) & df[vcol].notna()]
    items=[{"name":str(r['entities']),"value":round(float(r[vcol]),2)} for _,r in sub.iterrows() if str(r['entities']) not in DROP and float(r[vcol])>min_val]
    items.sort(key=lambda x:-x['value'])
    out={"title":f"{title} ({y})","unit":unit,"source":f"{src_org} via OWID ETL catalog, {y}","source_url":f"https://ourworldindata.org/grapher/{slug}","date":str(y),"items":items}
    json.dump(out, open(f'../datasets/{ds_id}.json','w'))
    print(ds_id, y, len(items))

if __name__=='__main__':
    build(*sys.argv[1:6])
