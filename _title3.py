p="server/src/index.js"
s=open(p,encoding="utf-8").read()
s=s.replace("import quotesRouter from './routes/quotes.js'","import quotesRouter from './routes/quotes.js'\nimport customerTitlesRouter from './routes/customerTitles.js'",1)
s=s.replace("app.use('/api/quotes', quotesRouter)","app.use('/api/quotes', quotesRouter)\napp.use('/api/customer-titles', customerTitlesRouter)",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("mount ok")
