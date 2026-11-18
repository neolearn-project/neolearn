// Retired: account creation requires the verified signup flow.
export async function POST() {
 return Response.json({ok:false,error:"Please use the current student signup form."},{status:410,headers:{"Cache-Control":"no-store"}});
}
