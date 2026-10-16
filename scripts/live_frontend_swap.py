import re,glob
p=open('pricing.html').read()
p=re.sub(r'href="sms:\+15054693851[^"]*" data-tier="([^"]+)">Text us to join</a><p class="fine soon">[^<]*</p>',r'href="member-signup.html?tier=\1" data-tier="\1">Start membership</a>',p)
p=p.replace(' class="fine mem-rule" hidden',' class="fine mem-rule"').replace('<span class="mem-rule" hidden>','<span class="mem-rule">')
open('pricing.html','w').write(p)
c=open('config.js').read()
if 'membershipCheckoutFn' not in c: c+='\nwindow.SITE.membershipCheckoutFn = "membership-checkout";\n'
open('config.js','w').write(c)
for f in ['member-signup.html','member.html']:
    s=open(f).read().replace('Membership (test mode preview)','Membership'); open(f,'w').write(s)
v=max(int(x) for f in glob.glob('*.html') for x in re.findall(r'v=(\d+)',open(f).read()))+1
for f in glob.glob('*.html')+glob.glob('admin/*.html'):
    s=open(f).read(); open(f,'w').write(re.sub(r'v=\d+','v=%d'%v,s))
print('swapped; v=',v)
