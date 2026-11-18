// Retired generic verifier: credentials require a purpose-bound challenge.
export async function POST(){return Response.json({ok:false,error:"Restart the requested login or recovery flow."},{status:410,headers:{"Cache-Control":"no-store"}});}
