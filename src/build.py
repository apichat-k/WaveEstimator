import json
head=open('app.head.html').read(); js=open('core.js').read()+open('app2.js').read()
open('app.js','w').write(js)
shores=json.load(open('shore.json')); prj=json.load(open('projects.json'))
data='const SHORES = '+json.dumps(shores,separators=(',',':'))+';\nconst PROJECTS = '+json.dumps(prj,separators=(',',':'),ensure_ascii=False)+';\n'
frag=head+'\n<script>\n// Shorelines: Hydro_aw.kmz (encoded polyline, 1e-5°, rings joined by ".") · Projects: Boundary_*.kmz / PV_Array_*.kmz (lon, lat)\n'+data+'</script>\n<script>\n'+js+'</script>\n'
open('FPV_Wave_Estimator.artifact.html','w').write(frag)
full='<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n'+frag+'</body>\n</html>\n'
open('FPV_Wave_Estimator.html','w').write(full)
print(len(frag))
