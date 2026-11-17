import unity, fsb, pickle, struct, os, subprocess, re, json
setups=pickle.load(open('setups.pkl','rb'))
def ident(ch,rate):
    return b'\x01vorbis'+struct.pack('<IBIiiiB',0,ch,rate,0,0,0,(11<<4)|8)+b'\x01'
def comment():
    v=b'fsb'; return b'\x03vorbis'+struct.pack('<I',len(v))+v+struct.pack('<I',0)+b'\x01'
info={}
for n in unity.all_files():
    s=unity.SFile(n)
    for pid,(o,sz,c,si) in s.objects.items():
        if c!=83: continue
        r,_,_=s.reader(pid)
        name=r.str(); lt=r.i32(); ch=r.i32(); fr=r.i32(); bps=r.i32(); ln=r.f32(); r.bool(); r.bool(); r.align()
        r.i32(); r.bool(); r.bool(); r.bool(); r.align()
        src=r.str(); off=r.u('Q'); size=r.u('Q'); fmt=r.i32()
        p=os.path.join(unity.DATA, os.path.basename(src))
        with open(p,'rb') as f: f.seek(off); b=f.read(size)
        mode,ss=fsb.parse_fsb5(b)
        smp=ss[0]
        fn=re.sub(r'[^A-Za-z0-9_\-]','_',name)
        if mode==15:
            h=[ident(smp['ch'],smp['freq']),comment(),setups[smp['crc']]]
            open('/tmp/a.ogg','wb').write(fsb.to_ogg(smp,h))
            inp=['-i','/tmp/a.ogg']
        else:
            open('/tmp/a.raw','wb').write(smp['data'])
            inp=['-f','s16le','-ar',str(smp['freq']),'-ac',str(smp['ch']),'-i','/tmp/a.raw']
        res=subprocess.run(['ffmpeg','-hide_banner','-v','error','-y',*inp,'-c:a','libmp3lame','-q:a','5','/home/claude/out/snd/%s.mp3'%fn],capture_output=True,text=True)
        info[name]=dict(file=fn, len=ln, loop=smp.get('loop'))
        if res.returncode or res.stderr: print(name,'ERR',res.stderr[:200])
json.dump(info,open('audio_info.json','w'),ensure_ascii=False,indent=0)
print(len(info))
