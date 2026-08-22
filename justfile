default: tc t v

d:
	npm run dev

tc:
	npm run typecheck

t:
	npm run test

v:
	npm run validate

b:
	npm run build

p: b
	npm run preview
