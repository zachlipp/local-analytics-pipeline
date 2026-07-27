default: tc t

d:
	npm run dev

tc:
	npm run typecheck

t:
	npm run test

b:
	npm run build

p: b
	npm run preview
