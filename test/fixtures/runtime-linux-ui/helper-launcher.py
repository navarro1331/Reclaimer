import os,json,sys
with open(os.environ['OWNED_HELPER_PID_FILE'],'w') as out:json.dump({'pid':os.getpid()},out)
os.execv(sys.argv[1],sys.argv[1:])
