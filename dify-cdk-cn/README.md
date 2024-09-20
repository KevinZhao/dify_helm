## Worklog
1. `export AWS_PROFILE=china_region_profile`
2. `cdk bootstrap`
3. `npm run build`
4. `cdk synth`
5. `cdk deploy --all --concurrency 5 --require-approval never`
6. OpenSearch: The master user password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.
7. helm pull aws-load-balancer-controller --repo https://aws.github.io/eks-charts
8. aws ecr get-login-password | docker login --username AWS --password-stdin 772532280796.dkr.ecr.cn-northwest-1.amazonaws.com.cn
9. docker pull langgenius/dify-api:0.8.2
10. docker pull langgenius/dify-web:0.8.2
11. docker pull langgenius/dify-sandbox:latest
10. docker tag docker.io/langgenius/dify-api:0.8.2 772532280796.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-api:0.8.2
11. docker tag docker.io/langgenius/dify-web:0.8.2 772532280796.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-web:0.8.2
12. docker tag docker.io/langgenius/dify-sandbox:latest 772532280796.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-sandbox:latest
13. docker push 772532280796.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-api:0.8.2
14. docker push 772532280796.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-web:0.8.2
15. docker push 772532280796.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-sandbox:latest



